# bx-sqlite

```
|:------------------------------------------------------:|
| ⚡︎ B o x L a n g ⚡︎
| Dynamic : Modular : Productive
|:------------------------------------------------------:|
```

<blockquote>
	Copyright Since 2023 by Ortus Solutions, Corp
	<br>
	<a href="https://www.boxlang.io">www.boxlang.io</a> |
	<a href="https://www.ortussolutions.com">www.ortussolutions.com</a>
</blockquote>

<p>&nbsp;</p>

This module provides a BoxLang JDBC driver for SQLite databases, enabling seamless integration between BoxLang applications and SQLite for both in-memory and file-based database operations.

## Features

- 🚀 **High Performance**: Built on the proven `org.xerial:sqlite-jdbc` driver
- 💾 **In-Memory Support**: Perfect for testing and temporary data storage
- 📁 **File-Based Databases**: Persistent storage with full ACID compliance
- 🔄 **BoxLang Integration**: Native support for BoxLang's `queryExecute()` and datasource management
- ⚡ **Zero Configuration**: Works out of the box with minimal setup
- 🧪 **Testing Ready**: Ideal for unit tests with in-memory databases

## Installation

### Via CommandBox (Recommended)

```bash
box install bx-sqlite
```

### Via BoxLang Module Installer

```bash
# Into the BoxLang HOME
install-bx-module bx-sqlite

# Or a local folder
install-bx-module bx-sqlite --local
```

## Quick Start

Once installed, you can immediately start using SQLite databases in your BoxLang applications:

```javascript
// Define an in-memory datasource for quick testing (shared cache)
this.datasources[ "testDB" ] = {
    "driver": "sqlite",
    "database": "memory:testDB"
};

// Use it in your code
result = queryExecute("SELECT 1 as test", [], {"datasource": "testDB"});
```

## Configuration Examples

See [BoxLang's Defining Datasources](https://boxlang.ortusbooks.com/boxlang-language/syntax/queries#defining-datasources) documentation for full examples on where and how to construct a datasource connection pool.

### In-Memory Database

Perfect for testing, caching, or temporary data storage. Named in-memory databases use SQLite's shared cache mode (`file:<name>?mode=memory&cache=shared`), allowing multiple connections to access the same in-memory database:

```javascript
// Named in-memory database (shared across connections)
this.datasources["testDB"] = {
    "driver": "sqlite",
    "database": "memory:testDB"
};

// With additional parameters (parameters after ; are preserved for connection props)
this.datasources["cacheDB"] = {
    "driver": "sqlite",
    "database": "memory:cacheDB;create=true"
};

// Anonymous in-memory database (single connection only)
this.datasources["anonDB"] = {
    "driver": "sqlite",
    "database": ":memory:"
};

// Blank memory name resolves to :memory:
this.datasources["blankDB"] = {
    "driver": "sqlite",
    "database": "memory:"
};
```

### File-Based Database

For persistent data storage:

```javascript
// Absolute path (recommended)
this.datasources["mainDB"] = {
    "driver": "sqlite",
    "database": "/var/www/myapp/data/main.db"
};

// Relative path (from application root)
this.datasources["localDB"] = {
    "driver": "sqlite",
    "database": "./data/local.db"
};

// Windows path example
this.datasources["winDB"] = {
    "driver": "sqlite",
    "database": "C:\\MyApp\\data\\app.db"
};
```

### Advanced Configuration

You can also specify additional connection parameters:

```javascript
this.datasources["advancedDB"] = {
    "driver": "sqlite",
    "database": "/path/to/database.db",
    // Optional: Custom connection properties
    "custom": {
        "journal_mode": "WAL",
        "synchronous": "NORMAL",
        "cache_size": "10000"
    }
};
```

## Usage Examples

### Basic Database Operations

```javascript
// Create a table
queryExecute("
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
", [], {"datasource": "mainDB"});

// Insert data
queryExecute("
    INSERT INTO users (name, email)
    VALUES (?, ?)
", ["John Doe", "john@example.com"], {"datasource": "mainDB"});

// Query data
users = queryExecute("
    SELECT * FROM users
    WHERE email = ?
", ["john@example.com"], {"datasource": "mainDB"});

// Update data
queryExecute("
    UPDATE users
    SET name = ?
    WHERE id = ?
", ["John Smith", 1], {"datasource": "mainDB"});
```

### Working with Transactions

```javascript
try {
    // Begin transaction
    queryExecute("BEGIN TRANSACTION", [], {"datasource": "mainDB"});

    // Multiple operations
    queryExecute("INSERT INTO users (name, email) VALUES (?, ?)",
                ["User 1", "user1@test.com"], {"datasource": "mainDB"});
    queryExecute("INSERT INTO users (name, email) VALUES (?, ?)",
                ["User 2", "user2@test.com"], {"datasource": "mainDB"});

    // Commit transaction
    queryExecute("COMMIT", [], {"datasource": "mainDB"});

} catch (any e) {
    // Rollback on error
    queryExecute("ROLLBACK", [], {"datasource": "mainDB"});
    rethrow;
}
```

### Testing with In-Memory Databases

Perfect for unit tests:

```javascript
// Test setup
this.datasources["testDB"] = {
    "driver": "sqlite",
    "database": "memory:testDB"
};

function beforeTests() {
    // Create test schema
    queryExecute("
        CREATE TABLE products (
            id INTEGER PRIMARY KEY,
            name VARCHAR(100),
            price DECIMAL(10,2)
        )
    ", [], {"datasource": "testDB"});

    // Insert test data
    queryExecute("
        INSERT INTO products (name, price) VALUES
        ('Product A', 10.50),
        ('Product B', 25.00)
    ", [], {"datasource": "testDB"});
}

function testProductQuery() {
    var result = queryExecute("
        SELECT COUNT(*) as total FROM products
    ", [], {"datasource": "testDB"});

    expect(result.total).toBe(2);
}
```

## Development

### Prerequisites

- Java 21+
- BoxLang Runtime 1.4.0+
- Gradle (wrapper included)

### Building from Source

```bash
# Clone the repository
git clone https://github.com/ortus-boxlang/bx-sqlite.git
cd bx-sqlite

# Build the module
./gradlew build

# Run tests
./gradlew test

# Create module structure for local testing
./gradlew createModuleStructure
```

### Project Structure

```
bx-sqlite/
├── src/
│   ├── main/
│   │   ├── bx/
│   │   │   └── ModuleConfig.bx          # Module configuration
│   │   ├── java/
│   │   │   └── ortus/boxlang/modules/
│   │   │       └── sqlite/
│   │   │           └── SQLiteDriver.java # JDBC driver implementation
│   │   └── resources/
│   └── test/
│       ├── java/                        # Unit and integration tests
│       └── resources/
├── build.gradle                         # Build configuration
├── box.json                            # ForgeBox module manifest
└── readme.md                           # This file
```

### Testing

The module includes comprehensive tests:

- **Unit Tests**: Test the SQLite driver implementation directly
- **Integration Tests**: Test the module within the full BoxLang runtime
- **End-to-End Tests**: Verify database operations work correctly

```bash
# Run all tests
./gradlew test

# Run with verbose output
./gradlew test --info

# Run specific test class
./gradlew test --tests "SQLiteDriverTest"
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for your changes
5. Ensure all tests pass (`./gradlew test`)
6. Format your code (`./gradlew spotlessApply`)
7. Commit your changes (`git commit -m 'Add amazing feature'`)
8. Push to the branch (`git push origin feature/amazing-feature`)
9. Open a Pull Request

## Compatibility

| bx-sqlite Version | BoxLang Version | SQLite JDBC Version |
|------------------|----------------|-------------------|
| 1.2.x  		   | 1.4.0+         | 3.53.0.0          |
| 1.1.x            | 1.4.0+         | 3.50.3.0          |
| 1.0.x            | 1.3.0+         | 3.50.1.0          |

## Troubleshooting

### Common Issues

#### Database file not found

```
Ensure the directory exists and BoxLang has write permissions:
mkdir -p /path/to/database/directory
chmod 755 /path/to/database/directory
```

#### Connection URL errors

```
The database property is required. Ensure your datasource configuration includes:
"database": "/path/to/file.db" or "database": "memory:dbname"
```

#### Testing issues

```
Integration tests require the module to be built first:
./gradlew createModuleStructure
```

### Debug Mode

Enable debug logging in your BoxLang application:

```javascript
// In your Application.bx
this.datasources["debugDB"] = {
    "driver": "sqlite",
    "database": "/path/to/debug.db",
    "logSql": true,
    "logLevel": "DEBUG"
};
```

## Resources

- **Documentation**: [BoxLang Database Guide](https://boxlang.ortusbooks.com/boxlang-language/syntax/queries)
- **SQLite Documentation**: [https://www.sqlite.org/docs.html](https://www.sqlite.org/docs.html)
- **Issues & Support**: [GitHub Issues](https://github.com/ortus-boxlang/bx-sqlite/issues)
- **ForgeBox**: [bx-sqlite Package](https://forgebox.io/view/bx-sqlite)

## Changelog

See [CHANGELOG.md](changelog.md) for a complete list of changes and version history.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](https://www.apache.org/licenses/LICENSE-2.0) for details.

## Ortus Sponsors

BoxLang is a professional open-source project and it is completely funded by the [community](https://patreon.com/ortussolutions) and [Ortus Solutions, Corp](https://www.ortussolutions.com). Ortus Patreons get many benefits like a cfcasts account, a FORGEBOX Pro account and so much more. If you are interested in becoming a sponsor, please visit our patronage page: [https://patreon.com/ortussolutions](https://patreon.com/ortussolutions)

### THE DAILY BREAD

> "I am the way, and the truth, and the life; no one comes to the Father, but by me (JESUS)" Jn 14:1-12
