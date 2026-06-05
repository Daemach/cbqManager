/**
 * cbqManager own store — application users (replaces the mock UserService). RBAC role
 * lives here; per-Connection scope lives in connection_grants. (PRD Q14)
 */
component {

	function up( schema, qb ) {
		schema.create( "cbqm_users", ( t ) => {
			t.increments( "id" );
			t.string( "username" ).unique();
			t.string( "firstName" ).nullable();
			t.string( "lastName" ).nullable();
			t.string( "password" );                       // bcrypt hash
			t.string( "role" ).default( "viewer" );       // viewer | operator | admin
			t.boolean( "isActive" ).default( true );
			t.timestamp( "createdDate" ).nullable();
			t.timestamp( "modifiedDate" ).nullable();
		} );
	}

	function down( schema, qb ) {
		schema.dropIfExists( "cbqm_users" );
	}

}
