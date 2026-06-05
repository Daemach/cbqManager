/**
 * cbqManager own store — the Connection Registry. Each row is a Managed App's cbq database
 * (one per environment). DB credentials are encrypted at the application layer; non-secret
 * fields stay plaintext so the registry remains queryable (ADR-0003, ADR-0005).
 */
component {

	function up( schema ) {
		schema.create( "cbqm_connections", ( t ) => {
			t.increments( "id" );
			t.string( "name" ).unique();                  // display label
			t.string( "environment" ).nullable();         // development | staging | production
			t.string( "grammar" ).nullable();             // detected, operator-overridable
			t.string( "tableName" ).default( "cbq_jobs" );
			// datasource — class + connection string plaintext (no creds); creds encrypted as
			// a single { username, password } blob with one per-record IV (ADR-0003)
			t.string( "datasourceClass" );
			t.text( "connectionString" );
			t.text( "secrets_enc" ).nullable();
			t.string( "cipherIv" ).nullable();
			t.string( "cipherAlg" ).nullable();
			// realtime
			t.unsignedInteger( "broadcastConnectionId" ).nullable();
			t.string( "channel" ).nullable();
			t.string( "events" ).nullable();              // csv of event names
			// worker-pool params (inferred timeout; configured priority fallback — Q17)
			t.unsignedInteger( "poolTimeout" ).nullable();
			t.unsignedInteger( "poolMaxAttempts" ).nullable();
			t.text( "queuePriority" ).nullable();         // json array
			t.boolean( "autoRetry" ).default( true );
			// harvester (ADR-0004)
			t.boolean( "harvestEnabled" ).default( true );
			t.unsignedInteger( "harvestInterval" ).nullable();
			t.boolean( "isActive" ).default( true );
			t.timestamp( "createdDate" ).nullable();
			t.timestamp( "modifiedDate" ).nullable();

			t.index( "environment" );
		} );
	}

	function down( schema ) {
		schema.dropIfExists( "cbqm_connections" );
	}

}
