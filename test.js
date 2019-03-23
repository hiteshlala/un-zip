/*

This is a demo script to unzip a file that uses Deflate algorithm.


Resouce reading:

https://en.wikipedia.org/wiki/Zip_(file_format)
https://stackoverflow.com/questions/10308110/simplest-way-to-download-and-unzip-files-in-node-js-cross-platform
https://stackoverflow.com/questions/11611950/unzip-a-zip-file-using-zlib
https://stackoverflow.com/questions/10166122/zlib-differences-between-the-deflate-and-compress-functions
https://stackoverflow.com/questions/4802097/how-does-one-find-the-start-of-the-central-directory-in-zip-files

*/


const fs = require( 'fs' );
const path = require( 'path' );
const t = require( './tools' );


// const source =  path.resolve( './tvgbackup_5c8d5fe24687b7000505f2d1.zip');
const source =  path.resolve('./testzip.zip'); // 42KB true
// const source = path.resolve( './Notredame.tvg' );
// const source = path.resolve('./LeicaShowroom 1.tvg' ); // 4.2GB false
// const source = 'E:/Data/Notredame.tvg';
// const source = 'E:/Data/SharedData.tvg'; // 36MB true
// const source = 'E:/Data/LeicaShowroom 1.tvg'; // 4.2GB false
// const source = 'E:/Data/Monticello TruView.tvg'; // 8.4GB false

console.log( 'filename:', source );

const out =  path.resolve( './junk' );
t.mkdir( out );


async function start () {

  const fd = fs.openSync( source, 'r' );

  const stat = fs.statSync( source );
  console.log( '\nStat:\n', stat );
  
  const toRead = 1024;

  let buf = Buffer.alloc( toRead, 0 );
  fs.readSync( fd, buf, 0, toRead, stat.size - toRead );
  
  const ecdr = t.readECDR( buf );
  console.log( '\nECDR:\n', ecdr, '\n' );

  const zecdl = t.readZECDL( buf );
  console.log( '\nZECDL:\n', zecdl, '\n' );

  const zecdr = zecdl.found && t.readZECDR( fd, zecdl.startZip64CD );
  zecdl.found && console.log( 'ZECDR', zecdr );

  let records = 0;

  if ( ecdr.found && !zecdl.found ) {
    const toRead = ecdr.sizeCDRecord;
    const start = ecdr.startCD;
    records = ecdr.numCDRecOnDisk;
    buf = Buffer.alloc( toRead, 0 );
    fs.readSync( fd, buf, 0, toRead, start );
  }
  else if ( zecdl.found ) {
    const toRead = zecdr.sizeCDRecord;
    const start = zecdr.startCD;
    records = zecdr.numCDRecOnDisk;
    buf = Buffer.alloc( toRead, 0 );
    fs.readSync( fd, buf, 0, toRead, start );
  }

  let index = 0;
  let cdh;
  let count = 0;
  // records = 3;
  const missing = [];
  let inflated = 0;
  let copied = 0;
  let unknown = 0;
  for ( let i = 0; i < records; i++ ) {
    console.log( `\n ==== Processing Record: ${i} ====`);
    index = cdh ? cdh.length + index : 0;
    cdh = t.readCDH( buf, index );
    console.log( '\nCDH:', cdh, '\n' );
    const lfh = t.readLFH( fd, cdh.offsetStart )
    console.log( '\nLFH:\n', lfh );
    if ( lfh.found ) {
      count++;
      try {
        if ( lfh.comprMeth === 8 ) {
          inflated++;
          await t.inflate( fs.openSync( source, 'r'), cdh, lfh, out );
        }
        else if ( lfh.comprMeth === 0 ) {
          copied++;
          await t.copy( fs.openSync( source, 'r'), cdh, lfh, out );
        }
        else {
          unknown++;
          console.log( 'unknown compression method, do nothing' );
        }
      }
      catch( e ) {
        console.log( 'in for loop', e );
      }
    }
    else {
      missing.push( i )
      break; //debug
    }
  }
  console.log( '\n =========== Summary =========== \n')
  console.log( 'Records:', records, 'Found:', count );
  console.log( 'Missing:', missing );
  console.log(  'Inflated:', inflated );
  console.log( 'Copied:', copied );
  console.log( 'Unknown:', unknown );
  console.log( '\nECDR:\n', ecdr, '\n' );
  console.log( '\nZECDL:\n', zecdl, '\n' );
  
}

start();
