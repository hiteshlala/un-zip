const fs = require( 'fs' );
const path = require( 'path' );
const t = require( './tools' );

class Unzippy {
  constructor( options ) {
    this.src = path.resolve(options.src || '' );
    this.dest = path.resolve( options.dest || './' );
    this.dir; // []
    this.errorState = false;
    this.threads = options.threads || 1;
    try {
      const toRead = 1024;
      this.stat = fs.statSync( this.src );
      this.fd = fs.openSync( this.src, 'r' );
      let buf = Buffer.alloc( toRead, 0 );
      fs.readSync( this.fd, buf, 0, toRead, this.stat.size - toRead );
      this.ecdr = t.readECDR( buf );
      this.zecdl = this.ecdr && t.readZECDL( buf );
      this.zecdr = this.zecdl.found && t.readZECDR( this.fd, this.zecdl.startZip64CD );
      if ( !this.ecdr.found ) {
        this.error = 'Unrecognized file archive.';
        this.errorState = true;
      }
    }
    catch( e ) {
      this.error = e.message || e;
      this.errorState = true;
    }
  }
  async unzip() {
    if ( this.errorState ) { throw new Error( this.error ); }
    if ( !this.dir ) {
      this.getDir();
    }
    let processing = 0;
    const threads = [];
    const errors = [];
    const success = [];
    const processOne = async () => {
      try {
        if ( processing < this.dir.length ) {
          const index = processing;
          processing++;
          const result = await this.extractSingle( index );
          success.push( result );
          return processOne();
        }
        else {
          return Promise.resolve();
        }
      }
      catch( e ) {
        errors.push( e );
        return processOne();
      }
    };
    for( let i = 0; i < this.threads; i++ ) {
      threads.push( processOne() );
    }
    return Promise.all( threads )
    .then( () => {
      return {
        errors,
        success
      };
    })
  }
  getDir() {
    if ( this.errorState ) { throw new Error( this.error ); }
    if ( this.dir ) { return this.dir; }
    else {
      const { ecdr, zecdl, fd, zecdr } = this;
      let buf;
      let records;
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
      this.dir = [];
      let index = 0;
      let cdh;
      for ( let i = 0; i < records; i++ ) {
        index = cdh ? cdh.length + index : 0;
        cdh = t.readCDH( buf, index );
        this.dir.push( cdh );
      }
      return this.dir;
    }
  }
  async extractSingle( id ) {
    if ( this.errorState ) { return new Error( this.error ); }
    if ( typeof id !== 'number' || id >= this.dir.length ) { return new Error( 'Invalid id'); }
    const cdh = this.dir[ id ];
    const lfh = t.readLFH( this.fd, cdh.offsetStart )
    // console.log( '\nLFH:\n', lfh );
    if ( lfh.found ) {
      try {
        if ( lfh.comprMeth === 8 ) {
          await t.inflate( fs.openSync( this.src, 'r' ), cdh, lfh, this.dest );
          return { extracted: cdh.fName };
        }
        else if ( lfh.comprMeth === 0 ) {
          await t.copy( fs.openSync( this.src, 'r' ), cdh, lfh, this.dest );
          return { extracted: cdh.fName };
        }
        else {
          const msg = `Error extracting file [ ${cdh.fName} ] -Unsupported compression method ( ${lfh.comprMeth} ), skipping`;
          console.log( msg );
          return new Error( msg );
        }
      }
      catch( e ) {
        const msg = `Error extracting file [ ${cdh.fName} ] - ${ e.message || e }`;
        console.log( msg );
        return new Error( msg );
      }
    }
    else {
      const msg = `Error extracting file [ ${cdh.fName} ] - Unable to find the local file header (lfh)`;
      console.log( msg );
      return new Error( msg );
    }

  }


}

module.exports.Unzippy = Unzippy;

module.exports.unzip = async ( src, dest, options ) => {
  const threads = options ? options.threads || 1 : 1;
  if ( !src || !dest ) return new Error( 'Source path or Destination path missing' );
  const u = new Unzippy({ src, dest, threads });
  return u.unzip();
}


