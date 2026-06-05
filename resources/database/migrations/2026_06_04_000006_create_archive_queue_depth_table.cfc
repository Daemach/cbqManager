/**
 * cbqManager own store — Queue Depth samples captured by the Harvester for trend history.
 * Mirrors the six Queue Health buckets per Queue over time (ADR-0004).
 */
component {

	function up( schema ) {
		schema.create( "cbqm_archive_queue_depth", ( t ) => {
			t.bigIncrements( "id" );
			t.unsignedInteger( "connectionId" );
			t.string( "queue" );
			t.timestamp( "sampledDate" ).nullable();
			t.unsignedInteger( "openTotal" ).default( 0 );
			t.unsignedInteger( "orphanedBlockers" ).default( 0 );
			t.unsignedInteger( "pickableFresh" ).default( 0 );
			t.unsignedInteger( "pickableReservedTimedout" ).default( 0 );
			t.unsignedInteger( "inFlight" ).default( 0 );
			t.unsignedInteger( "scheduledFuture" ).default( 0 );

			t.index( [ "connectionId", "queue" ] );
			t.index( "sampledDate" );
		} );
	}

	function down( schema ) {
		schema.dropIfExists( "cbqm_archive_queue_depth" );
	}

}
