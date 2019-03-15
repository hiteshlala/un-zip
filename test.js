/*
https://en.wikipedia.org/wiki/Zip_(file_format)
https://stackoverflow.com/questions/10308110/simplest-way-to-download-and-unzip-files-in-node-js-cross-platform
https://stackoverflow.com/questions/11611950/unzip-a-zip-file-using-zlib
https://stackoverflow.com/questions/10166122/zlib-differences-between-the-deflate-and-compress-functions
https://stackoverflow.com/questions/4802097/how-does-one-find-the-start-of-the-central-directory-in-zip-files

*/

const fs = require( 'fs' );
const os = require( 'os' );
const path = require( 'path' );
const zlib = require( 'zlib' );
const tools = require( './tools' );

// const source = 'E:/Data/SharedData.tvg'; // 36MB true
// const source = 'E:/Data/Notredame.tvg'; // 1.9GB true
// const source = 'E:/Data/Monticello TruView.tvg'; // 8.4GB false
// const source = 'E:/Data/LeicaShowroom 1.tvg'; // 4.2GB false
const source = os.platform() === 'win32' ? 'C:/dev/testrepo/zippStuff/testzip.zip': path.resolve('./testzip.zip'); // 42KB true

const out =  path.resolve( './junk' );
tools.mkdir( out );


function readUInt16( buf, i ) {
  return os.endianness() === 'LE' ? buf.readUInt16LE( i ) : buf.readUInt16BE( i );
}

function readUInt32( buf, i ) {
  return os.endianness() === 'LE' ? buf.readUInt32LE( i ) : buf.readUInt32BE( i );
}

/**
 * Finds the End of Central Directory record
 * @param {Buffer} buf 
 */
function findEOCD( buf ) {
  let eocd = 0x06054b50;
  for ( let i = 0; i < buf.length - 4; i++ ) {
    let a = readUInt32( buf, i );
    if ( a === eocd ) {
      const data = { 
        index: i, 
        found: true,
        diskNo: readUInt16( buf, i + 4 ),
        diskCDStarts: readUInt16( buf, i + 6 ),
        numCDRecOnDisk: readUInt16( buf, i + 8 ),
        totalCDRecords: readUInt16( buf, i + 10 ),
        sizeCDRecord: readUInt32( buf, i + 12 ),
        startCD: readUInt32( buf, i + 16 ),
        commentLen: readUInt16( buf, i + 20 )
      };
      data.comment =  buf.toString( 'utf8', i + 22, i + data.commentLen );
      return data;
    }
  }
  return { found: false }
}

/**
 * Reads the Central Directory Header located at i
 * There is one entry for each file in the zip archive
 * @param {fs.filehandle} fd 
 * @param {End of Central Directory} data 
 * @param {Number} i start of Central Directory Header
 */
function readCDHeaderSignature( fd, data, i ) {
  i = i || 0;
  const expected = 0x02014b50;
  const toRead = data.sizeCDRecord;
  const buf = Buffer.alloc( toRead, 0 );
  fs.readSync( fd, buf, 0, toRead, data.startCD );
  const found =  readUInt32( buf, 0 );
  if ( true ) { //found === expected ) {
    const data = {
      found: found === expected,
      vMade: readUInt16( buf, i + 4 ),
      vMinReq: readUInt16( buf, i + 6 ),
      genPurFlag: readUInt16( buf, i + 8 ),
      comprMeth: readUInt16( buf, i + 10 ),
      lastModTime: readUInt16( buf, i + 12 ),
      lastModDate: readUInt16( buf, i + 14 ),
      crc32: readUInt32( buf, i + 16 ),
      compressedSize: readUInt32( buf, i + 20 ),
      unCompressedSize: readUInt32( buf, i + 24 ),
      fNameLen: readUInt16( buf, i + 28 ),
      extraFieldLen: readUInt16( buf, i +  30 ),
      fCommentLen: readUInt16( buf, i + 32 ),
      diskNoStart: readUInt16( buf, i + 34 ),
      internalFileAttr: readUInt16( buf, i + 36 ),
      externalFileAttr: readUInt32( buf, i + 38 ),
      offsetStart: readUInt32( buf, i + 42 ),
    }
    data.fName = buf.toString( 'utf8', i + 46, i + 46 + data.fNameLen );
    data.extraField = buf.toString( 'utf8', i + 46 + data.fNameLen, i + 46 + data.fNameLen + data.extraFieldLen );
    data.comment = buf.toString( 'utf8', i + 46 + data.fNameLen + data.extraFieldLen, i + 46 + data.fNameLen + data.extraFieldLen + data.fCommentLen );
    data.length = i + 46 + data.fNameLen + data.extraFieldLen + data.fCommentLen;
    return data;
  }
  return { found: false };
}

function readLocalFileHeader( fd, i ) {
  const expected = 0x04034b50;
  const toRead = 1024;
  const buf = Buffer.alloc( toRead, 0 );
  fs.readSync( fd, buf, 0, toRead, i );
  const found =  readUInt32( buf, 0 );
  if ( true ) { //found === expected ) {
    const data = {
      found: found === expected,
      vMinReq: readUInt16( buf, 4 ),
      genPurFlag: readUInt16( buf, 6 ),
      comprMeth: readUInt16( buf, 8 ),
      lastModTime: readUInt16( buf, 10 ),
      lastModDate: readUInt16( buf, 12 ),
      crc32: readUInt32( buf, 14 ),
      compressedSize: readUInt32( buf, 18 ),
      unCompressedSize: readUInt32( buf, 22 ),
      fNameLen: readUInt16( buf, 26 ),
      extraFieldLen: readUInt16( buf,  28 ),
    }
    data.fName = buf.toString( 'utf8', 30, 30 + data.fNameLen );
    data.extraField = buf.toString( 'utf8', 30 + data.fNameLen, 30 + data.fNameLen + data.extraFieldLen );
    data.length = 30 + data.fNameLen + data.extraFieldLen;
    return data;
  }
  return { found: false };
}

async function unzip( fd, info ) {
  const outfilepath = path.resolve( out, info.fName );
  if ( info.compressedSize == 0 ) {
    tools.mkdir( outfilepath );
    return;
  }

  const dir = path.dirname( outfilepath );
  tools.mkdir( dir );

  const data = readLocalFileHeader( fd, info.offsetStart );
  console.log( '\nLocal File Header\n', data, '\n' );

  // /*
  try {
    const prom = async () => new Promise(( resolve, reject) => {
      console.log( Date.now() )
      // /*
      const outfile = fs.createWriteStream( outfilepath );
      const infile = fs.createReadStream( '', {
        fd: fd,
        start: data.length + info.offsetStart,
        end: data.length + info.offsetStart + info.compressedSize,
        encoding: null
      });
      const unzip = zlib.createUnzip();
      unzip.on( 'error', ( e ) => {
        console.log( 'unzip error', info.fName, e.message )
        console.log( 'unzip error', e );
        reject( e );
      });
      unzip.on( 'close', () => { resolve(); });
      infile.pipe( unzip ).pipe( outfile );
      outfile.on( 'close', () => { resolve(); });
      outfile.on( 'error', (e) => { 
        console.log( 'outfile error', e );
        reject(e); 
      });
      // */
    });
    await prom();
    return;
  }
  catch( e ) {
    console.log( 'error in try catch ', e );
    return;
  }
  // */
  
}


async function start () {

  const fd = fs.openSync( source, 'r' );
  const stat = fs.statSync( source );
  console.log( stat );
  const toRead = 1024;
  const buf = Buffer.alloc( toRead, 0 );
  fs.readSync( fd, buf, 0, toRead, stat.size - toRead );
  console.log( buf )
  const result = findEOCD( buf );
  console.log( '\nEnd Of Central Directory:\n', result, '\n' );

  if ( result.found ) {
    let CDHeader;// = readCDHeaderSignature( fd,  result );
    // console.log( '\nCentral Header:', CDHeader, '\n' );
    // await unzip( fd, CDHeader );
    try {
      for ( let i = 0; i < result.numCDRecOnDisk; i++ ) {
        const index = CDHeader ? CDHeader.length : 0;
        CDHeader = readCDHeaderSignature( fd,  result, index );
        console.log( '\nCentral Header:', CDHeader, '\n' );
        await unzip( fd, CDHeader );
      }
    }
    catch( e ) {
      console.log( 'in for loop', e );
    }
  }
}
 start();

/* trying to understand little and big endian

const buf = (new Uint8Array([1,2,3,4])).buffer;
console.log( 'buffer:', buf )

const isLE = (new Uint32Array((new Uint8Array([1,2,3,4])).buffer))[0] === 0x04030201;
console.log( 'isLE', isLE )

const isBE = (new Uint32Array((new Uint8Array([4,3,2,1])).buffer))[0] === 0x04030201;
console.log( 'isBE', isBE )

console.log( 'os.isLE', os.endianness() )

*/