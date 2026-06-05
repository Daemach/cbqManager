/**
 * cbqManager own store — per-Connection access scope (PRD Q14). A grant gives a user access
 * to a Connection; `canControl` distinguishes observe-only from control on that Connection.
 * Absence of a grant = no access (production is invisible unless explicitly granted).
 */
component {

	function up( schema ) {
		schema.create( "cbqm_connection_grants", ( t ) => {
			t.increments( "id" );
			t.unsignedInteger( "userId" );
			t.unsignedInteger( "connectionId" );
			t.boolean( "canControl" ).default( false );   // false = view-only on this connection
			t.timestamp( "createdDate" ).nullable();

			t.unique( [ "userId", "connectionId" ] );
		} );
	}

	function down( schema ) {
		schema.dropIfExists( "cbqm_connection_grants" );
	}

}
