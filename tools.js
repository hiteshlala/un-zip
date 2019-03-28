const fs = require( 'fs' );
const path = require( 'path' );
const os = require( 'os' );
const zlib = require( 'zlib' );

const verbose = false;
/**
 * Make directory structure recursively
 * @param {string} p 
 */
function mkdir( p ) {
  try {
    fs.mkdirSync( p );
    verbose && console.log( 'Created', p );
  }
  catch ( e ) {
    if ( e.code === 'ENOENT' ) {
      mkdir( path.dirname( p ) );
      mkdir( p );
    }
    else if ( e.code === 'EEXIST' ) {
      verbose && console.log( p, 'already exists' );
    }
    else {
      verbose && console.log( p, e.code );
      throw e;
    }
  }
}

/**
 * This is specific to zip directory listing which has a trailing /
 * 
 * Turns out that on macos this test does not work, I think because the strings
 * are not null terminated.  If the string ends in / then it does not count that
 * character as part of the string but if it ends in an alphabet it does!
 * 
 * So decided to use the compressed size value to determine directories....
 * 
 * @param {string} p 
 */
function isdir( p ) {
  // return p.charAt( p.length - 1 ) === '/';
  return /\/$/.test( p );
}


// I think that all the data is stored as LE fromat
function readUInt16( buf, i ) {
  // return os.endianness() === 'LE' ? buf.readUInt16LE( i ) : buf.readUInt16BE( i );
  return buf.readUInt16LE( i );
}

function readUInt32( buf, i ) {
  // return os.endianness() === 'LE' ? buf.readUInt32LE( i ) : buf.readUInt32BE( i );
  return buf.readUInt32LE( i );
}

function readUInt64( buf, i ) {
  const lsb = buf.readUInt32LE( i );
  const msb = buf.readUInt32LE( i + 32/8 );
  // return lsb + ( msb << 32 );  for some reason bit shifting more than 32 bits does not work - I think the word length is exceeded
  // console.log( 'readUINt64', lsb + (msb<<32), msb*Math.pow(2,32) + lsb );
  return msb * ( Math.pow( 2, 32 ) ) + lsb;

}


function readEF( buf, read, i ) {
  i = i || 0;
  result = {};
  if ( buf.length === 0 ) return result;
  const header = readUInt16( buf, i );
  const datasize = readUInt16( buf, i + 2 );
  
  if ( header !== 0x0001 ) {
    console.log( 'EF Zip64 record not found' );
    return {};
    if ( buf.length < datasize ) return {};
    return readEF( buf.slice(  datasize + 4 ), read );
  }

  const expectedsize = (read.unCompressedSize && 8 ) + (read.compressedSize && 8 ) + (read.offsetStart && 8) + ( read.diskNoStart && 4 );
  if ( read.unCompressedSize ) {
    result.unCompressedSize = readUInt64( buf, i + 4 );
    result.compressedSize = readUInt64( buf, i + 12 );
    if ( read.offsetStart ) {
      result.offsetStart = readUInt64( buf, i + 20);
      if ( read.diskNoStart ) {
        result.diskNoStart = readUInt16( buf, i + 28 )
      } 
    }
    else if ( read.diskNoStart ) {
      result.diskNoStart = readUInt16( buf, i + 20 )
    }
  }
  else if ( read.offsetStart ) {
    result.offsetStart = readUInt64( buf, i + 4 );
    if ( read.diskNoStart ) {
      result.diskNoStart = readUInt16( buf, i + 12 )
    } 
  }
  else if ( read.diskNoStart ) {
    result.diskNoStart = readUInt16( buf, i + 4 )
  }
  return result;
}


/**
 * Finds the End of Central Directory record
 * @param {Buffer} buf buffer containing part of the zip archive
 */
function readECDR( buf ) {
  let ecdrheader = 0x06054b50;
  for ( let i = 0; i < buf.length - 4; i++ ) {
    let a = readUInt32( buf, i );
    if ( a === ecdrheader ) {
      const data = { 
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


function readZECDL( buf ) {
  let eocd = 0x07064b50;
  for ( let i = 0; i < buf.length - 4; i++ ) {
    let a = readUInt32( buf, i );
    if ( a === eocd ) {
      const data = { 
        found: true,
        diskCDStarts: readUInt16( buf, i + 4 ),
        startZip64CD: readUInt64( buf, i + 8 ),
        totNumDisks: readUInt32( buf, i + 16 ),
      };
      return data;
    }
  }
  return { found: false }
}

/**
 * Reads the Central Directory Header located at i
 * There is one entry for each file in the zip archive
 * @param {fs.filehandle} fd 
 * @param {End of Central Directory} info 
 * @param {Number} i start of this Central Directory Header record
 */
function readCDH( buf, i ) {
  i = i || 0;
  const expected = 0x02014b50;
  const found = readUInt32( buf, 0 );
  if ( found === expected ) {
    // console.log( 'Get hrer', found );
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
    data.comment = buf.toString( 'utf8', i + 46 + data.fNameLen + data.extraFieldLen, i + 46 + data.fNameLen + data.extraFieldLen + data.fCommentLen );
    data.length = 46 + data.fNameLen + data.extraFieldLen + data.fCommentLen;
    const extraBuf = buf.slice( i + 46 + data.fNameLen, i + 46 + data.fNameLen + data.extraFieldLen );
    const readZ64Extra = {
      unCompressedSize: false,
      compressedSize: false,
      offsetStart: false,
      diskNoStart: false
    }
    if ( data.offsetStart === 0xffffffff ) {
      readZ64Extra.offsetStart = true;
    }
    if ( data.compressedSize === 0xffff || data.unCompressedSize === 0xffff ) {
      readZ64Extra.unCompressedSize = true;
      readZ64Extra.compressedSize = true;
    }
    if ( data.diskNoStart === 0xffff ) {
      readZ64Extra.diskNoStart = true;
    }
    // /*
    data.extraField = readEF( extraBuf, readZ64Extra );
    data.unCompressedSize = readZ64Extra.unCompressedSize ? data.extraField.unCompressedSize : data.unCompressedSize
    data.compressedSize = readZ64Extra.compressedSize ? data.extraField.compressedSize : data.compressedSize;
    data.diskNoStart = readZ64Extra.diskNoStart ? data.extraField.diskNoStart : data.diskNoStart;
    data.offsetStart = readZ64Extra.offsetStart ? data.extraField.offsetStart: data.offsetStart;
    // */
    return data;
  }
  return { found: false };
}

function readZECDR( fd, i ) {
  i = i || 0;
  const expected = 0x06064b50;
  let toRead = 12;

  let data = {};
  
  let buf = Buffer.alloc( toRead, 0 );
  fs.readSync( fd, buf, 0, toRead, i );
  let sig = readUInt32( buf, 0 );

  data.found = sig === expected;
  if ( data.found ) {
    data.sizeZEOCD = readUInt64( buf, 4 );
    toRead = data.sizeZEOCD + 12;
    buf = Buffer.alloc( toRead, 0 );
    fs.readSync( fd, buf, 0, toRead, i );
    
    data = {
      ...data,
      vMade: readUInt16( buf, 12 ),
      vMinReq: readUInt16( buf, 14 ),
      diskNo: readUInt32( buf, 16 ),
      diskNoStart: readUInt32( buf, 20 ),
      numCDRecOnDisk: readUInt64( buf, 24 ),
      totalCDRecords: readUInt64( buf, 32 ),
      sizeCDRecord: readUInt64( buf, 40 ),
      startCD: readUInt64( buf, 48 ),
    };
    data.extraField = buf.toString( 'utf8', 56,  56 + data.sizeZEOCD - 12 );
  }

  return data;
}

function readLFH( fd, i ) {
  const expected = 0x04034b50;
  const toRead = 1024;
  const buf = Buffer.alloc( toRead, 0 );
  fs.readSync( fd, buf, 0, toRead, i );
  const found =  readUInt32( buf, 0 );
  if ( found === expected ) {
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


async function inflate( fd, cdh, lfh, out ) {
  const outfilepath = path.resolve( out, cdh.fName );
  if ( cdh.compressedSize == 0 ) {
    return;
  }

  const dir = path.dirname( outfilepath );
  mkdir( dir );

  // /*
  try {
    const prom = async () => new Promise(( resolve, reject) => {
      // /*
      const outfile = fs.createWriteStream( outfilepath );
      const infile = fs.createReadStream( '', {
        fd: fd,
        start: lfh.length + cdh.offsetStart,
        end: lfh.length + cdh.offsetStart + cdh.compressedSize,
        encoding: null
      });
      // const unzip = zlib.createUnzip();
      const unzip = zlib.createInflateRaw();
      unzip.on( 'error', ( e ) => {
        console.log( 'unzip error', cdh.fName, e.message )
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

    return await prom();
  }
  catch( e ) {
    console.log( 'error in try catch ', e );
    return e;
  }
  // */
  
}

async function copy( fd, cdh, lfh, out ) {
  const outfilepath = path.resolve( out, cdh.fName );
  if ( cdh.compressedSize == 0 ) {
    return;
  }

  const dir = path.dirname( outfilepath );
  mkdir( dir );

  // /*
  try {
    const prom = async () => new Promise(( resolve, reject) => {
      // /*
      const outfile = fs.createWriteStream( outfilepath );
      const infile = fs.createReadStream( '', {
        fd: fd,
        start: lfh.length + cdh.offsetStart,
        end: lfh.length + cdh.offsetStart + cdh.compressedSize,
        encoding: null
      });
      infile.pipe( outfile );
      outfile.on( 'close', () => { resolve(); });
      outfile.on( 'error', (e) => { 
        console.log( 'outfile error', e );
        reject(e); 
      });
      // */
    });

    return await prom();
  }
  catch( e ) {
    console.log( 'error in try catch ', e );
    return e;
  }
  // */
  
}

module.exports = {
  mkdir,
  isdir,
  readCDH,
  readECDR,
  readZECDL,
  readZECDR,
  readLFH,
  inflate,
  copy

};
