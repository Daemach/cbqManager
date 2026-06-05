/**
 * cbqManager own store — the Archive of terminal Jobs harvested from each Connection before
 * cbq cleanup deletes them, giving long local memory filterable by Connection + Queue (ADR-0004).
 */
component {

	function up( schema ) {
		schema.create( "cbqm_archive_jobs", ( t ) => {
			t.bigIncrements( "id" );
			t.unsignedInteger( "connectionId" );
			t.unsignedBigInteger( "sourceId" );            // original cbq_jobs id
			t.string( "queue" );
			t.string( "mapping" ).nullable();
			t.string( "jobState" );                        // completed | failed
			t.unsignedTinyInteger( "attempts" ).default( 0 );
			t.unsignedBigInteger( "sourceCreatedDate" ).nullable();
			t.unsignedBigInteger( "terminalDate" ).nullable();   // completedDate or failedDate (epoch)
			t.longText( "payload" ).nullable();
			t.timestamp( "harvestedDate" ).nullable();

			t.index( [ "connectionId", "queue" ] );
			t.index( "terminalDate" );
			t.unique( [ "connectionId", "sourceId" ] );    // dedup via high-water mark
		} );
	}

	function down( schema ) {
		schema.dropIfExists( "cbqm_archive_jobs" );
	}

}
