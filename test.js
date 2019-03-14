/*
https://stackoverflow.com/questions/10308110/simplest-way-to-download-and-unzip-files-in-node-js-cross-platform
https://stackoverflow.com/questions/11611950/unzip-a-zip-file-using-zlib
https://stackoverflow.com/questions/10166122/zlib-differences-between-the-deflate-and-compress-functions
https://stackoverflow.com/questions/4802097/how-does-one-find-the-start-of-the-central-directory-in-zip-files

*/

const fs = require( 'fs' );
const os = require( 'os' );
const tools = require( './tools' );

// const source = 'E:/Data/SharedData.tvg'; // 36MB true
// const source = 'E:/Data/Notredame.tvg'; // 1.9GB true
// const source = 'E:/Data/Monticello TruView.tvg'; // 8.4GB false
// const source = 'E:/Data/LeicaShowroom 1.tvg'; // 4.2GB false
const source = 'C:/dev/testrepo/zippStuff/testzip.zip'; // 42KB true

const out = 'E:/hitesh/junk/output';

// https://en.wikipedia.org/wiki/Zip_(file_format)

function readUInt16( buf, i ) {
  return os.endianness() === 'LE' ? buf.readUInt16LE( i ) : buf.readUInt16BE( i );
}

function readUInt32( buf, i ) {
  return os.endianness() === 'LE' ? buf.readUInt32LE( i ) : buf.readUInt32BE( i );
}

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
  let CDHeader = readCDHeaderSignature( fd,  result );
  console.log( '\nCentral Header:', CDHeader, '\n' );
  for ( let i = 1; i < result.numCDRecOnDisk; i++ ) {
    CDHeader = readCDHeaderSignature( fd,  result, CDHeader.length );
    console.log( '\nCentral Header:', CDHeader, '\n' );
  }
}


/*
if (/\/$/.test(entry.fileName)) {
    // directory file names end with '/'
    return;
  }
*/


/* trying to understand little and big endian

const buf = (new Uint8Array([1,2,3,4])).buffer;
console.log( 'buffer:', buf )

const isLE = (new Uint32Array((new Uint8Array([1,2,3,4])).buffer))[0] === 0x04030201;
console.log( 'isLE', isLE )

const isBE = (new Uint32Array((new Uint8Array([4,3,2,1])).buffer))[0] === 0x04030201;
console.log( 'isBE', isBE )

console.log( 'os.isLE', os.endianness() )

*/