/**
 * cbqManager own store — append-only audit log. Every mutation (Retry, Reset, delete, complete,
 * Park, Release, Heal, cancel, and connection/credential/user changes) is recorded with who,
 * when, action, Connection, target, and result (PRD Q14).
 */
component {

	function up( schema ) {
		schema.create( "cbqm_audit_log", ( t ) => {
			t.bigIncrements( "id" );
			t.unsignedInteger( "userId" ).nullable();
			t.string( "username" ).nullable();
			t.string( "action" );                          // e.g. job.reset, batch.cancel, connection.create
			t.unsignedInteger( "connectionId" ).nullable();
			t.string( "targetType" ).nullable();           // job | failedJob | batch | connection | user
			t.string( "targetId" ).nullable();
			t.longText( "detail" ).nullable();             // json snapshot / parameters
			t.string( "result" ).nullable();               // success | noop | error (+ affected rows)
			t.timestamp( "createdDate" ).nullable();

			t.index( [ "userId", "action" ] );
			t.index( "createdDate" );
			t.index( "connectionId" );
		} );
	}

	function down( schema ) {
		schema.dropIfExists( "cbqm_audit_log" );
	}

}
