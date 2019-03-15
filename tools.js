const fs = require( 'fs' );
const path = require( 'path' );

/**
 * Make directory structure recursively
 * @param {string} p 
 */
function mkdir( p ) {
  try {
    fs.mkdirSync( p );
    console.log( 'Created', p );
  }
  catch ( e ) {
    if ( e.code === 'ENOENT' ) {
      mkdir( path.dirname( p ) );
      mkdir( p );
    }
    else if ( e.code === 'EEXIST' ) {
      console.log( p, 'already exists' );
    }
    else {
      console.log( p, e.code );
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

module.exports = {
  mkdir,
  isdir,
};
