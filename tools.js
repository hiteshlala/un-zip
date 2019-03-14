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
 * @param {string} p 
 */
function isdir( p ) {
  return /\/$/.test( p );
}

module.exports = {
  mkdir,
  isdir,
};
