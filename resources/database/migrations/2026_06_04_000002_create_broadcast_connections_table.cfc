/**
 * cbqManager own store — reusable Broadcast Connections (realtime transport + server creds).
 * Secret fields are encrypted at the application layer (ADR-0003, ADR-0006).
 */
component {

	function up( schema ) {
		schema.create( "cbqm_broadcast_connections", ( t ) => {
			t.increments( "id" );
			t.string( "name" ).unique();
			t.string( "transport" );                      // pusher | socketbox
			// Non-secret fields stay plaintext for queryability
			t.string( "pusherKey" ).nullable();
			t.string( "pusherCluster" ).nullable();
			t.string( "socketboxUrl" ).nullable();
			// Secrets ({ pusherAppId, pusherSecret, socketboxAuth }) encrypted as one blob
			// with a single per-record IV (ADR-0003, ADR-0006)
			t.text( "secrets_enc" ).nullable();
			t.string( "cipherIv" ).nullable();
			t.string( "cipherAlg" ).nullable();
			t.timestamp( "createdDate" ).nullable();
			t.timestamp( "modifiedDate" ).nullable();
		} );
	}

	function down( schema ) {
		schema.dropIfExists( "cbqm_broadcast_connections" );
	}

}
