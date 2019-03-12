/*
https://stackoverflow.com/questions/10308110/simplest-way-to-download-and-unzip-files-in-node-js-cross-platform
https://stackoverflow.com/questions/11611950/unzip-a-zip-file-using-zlib
https://stackoverflow.com/questions/10166122/zlib-differences-between-the-deflate-and-compress-functions
https://stackoverflow.com/questions/4802097/how-does-one-find-the-start-of-the-central-directory-in-zip-files

https://en.wikipedia.org/wiki/Zip_(file_format)

*/

const spawn = require( 'child_process' ).spawn;
const fs = require( 'fs' );

class Unzip {
  constructor( filePath, destPath ) {
    if ( !filePath || typeof filePath !== 'string' ) {
      throw new Error( `${filePath} - is not 'string' path to the archive.` );
    }
    this.filePath = filePath;
    this.destPath = destPath;
    this.fileInfo = fs.statSync( filePath );
    this.fd = fs.openSync( this.filePath, 'r' );
  }

  get info() {
    return this.fileInfo;
  }

  readDirectory1() {
    return new Promise(( resolve, reject ) => {
      let found = false;
      let index = 0;
      let count = 0;
      const str = fs.createReadStream( this.filePath );
      str.on( 'data', d => {
        str.pause();
        console.log( 'chunk:', count, d.length );
        const result = this.findEOCD( d );
        found = result.found;
        index = result.index;
        count += d.length;
        if ( found ) {
          str.destroy(0);
          console.log( 'found in read Dir' )
          resolve( {
            index,
            count,
            found
          })
        }
        else {
          str.resume();
        }
      });
      str.on( 'close', e => {
        if( e !== 0 ) {
          reject( e );
        }
        else {
          resolve({
            index,
            count,
            found: false
          });
        }
      } )
    });
  }

  findEOCD( buf ) {
    let eocd = 0x06054b50;
    for ( let i = 0; i < buf.length - 4; i++ ) {
      let a = buf.readUInt32LE( i );
      if ( a === eocd ) {
        return { index: i, found: true };
      }
    }
    return { found: false }
  }

  readDirectory() {
      let found = false;
      let index = 0;
      let count = 0;
      const str = fs.createReadStream( this.filePath );
      str.on( 'data', d => {
        str.pause();
        console.log( 'chunk:', count, d.length );
        const result = this.findEOCD( d );
        found = result.found;
        index = result.index;
        count += d.length;
        if ( found ) {
          str.destroy(0);
          console.log( 'found in read Dir' )
          resolve( {
            index,
            count,
            found
          })
        }
        else {
          str.resume();
        }
      });
      str.on( 'close', e => {
        if( e !== 0 ) {
          reject( e );
        }
        else {
          resolve({
            index,
            count,
            found: false
          });
        }
      } )
  }
  


}

function zlibUnzip( source, dest ) {
  return new Promise(( resolve, reject ) => {
    const inFile = fs.createReadStream( source );

    inFile.on( 'data', ( chunk ) => {
      console.log( 'chunk.length', chunk.length );
      console.log( 'chunk', chunk );
      console.log( 'chunk', Buffer.isBuffer( chunk ) );

      zlib.gunzip( chunk, ( e, d ) => {
        if ( e ) { 
          console.log( 'error decoding chunk', e );
        }
        else {
          console.log( 'inflated chunk.length', d.length );
        }
      });
    });    

    inFile.on( 'end', code => {
      if ( code !== 0 ) reject( code );
      else resolve();
    });

    inFile.on( 'error', error => {
      console.log( 'error in stream' )
      reject( error );
    });
  });
}


module.exports = Unzip;


