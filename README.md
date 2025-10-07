# 🚀 API Monitoring & Testing Dashboard

A comprehensive web-based dashboard for monitoring APIs, managing authentication tokens, and running automated test suites. Built with vanilla JavaScript, this tool provides a Postman-like experience directly in your browser.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

---

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Authentication & Tokens](#-authentication--tokens)
- [Test Management](#-test-management)
- [Workflows](#-workflows)
- [Examples](#-examples)
- [API Reference](#-api-reference)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

---

## ✨ Features

### 🔐 Authentication Management
- **JWT Token Support** - Automatic token extraction and storage
- **Multiple Auth Methods** - Bearer tokens, API keys, custom headers
- **Token Persistence** - Tokens saved in localStorage for reuse
- **Auto-Refresh** - Automatic token renewal (when supported by API)

### 🧪 Test Automation
- **Multiple Test Types** - GET, POST, PUT, PATCH, DELETE
- **Conditional Tests** - Required vs optional tests
- **Status Validation** - Expected status code checking
- **Body Templates** - Dynamic request bodies with variables
- **Header Management** - Custom headers per test

### 📊 Monitoring & Scheduling
- **Real-time Status** - Live API health monitoring
- **Scheduled Runs** - Automatic test execution (30-3600 seconds)
- **Test History** - Track all test runs and results
- **Failure Tracking** - Detailed error reporting

### 🎨 User Interface
- **Dark Mode** - Eye-friendly dark theme
- **Responsive Design** - Works on desktop and mobile
- **Live Updates** - Real-time status indicators
- **Export/Import** - JSON-based configuration

---

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/api-monitoring-dashboard.git

# Navigate to project directory
cd api-monitoring-dashboard

# Open in browser
open index.html
```

Or use a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server -p 8000

# Then open http://localhost:8000
```

### 2. First Project

1. Click **"+ Add Project"**
2. Enter project name and details
3. Click **"Save"**
4. Click on the project card to configure monitoring

### 3. Configure API Monitoring

1. **API Tab**: Set base URL
2. **Auth Tab**: Configure authentication
3. **Tests Tab**: Add test cases
4. **Schedule Tab**: Enable automatic runs (optional)

### 4. Run Tests

Click **"Run Now"** to execute all tests immediately.

---

## ⚙️ Configuration

### Project Structure

```json
{
  "name": "My API Project",
  "url": "https://api.example.com",
  "fieldNames": {
    "1": "Environment",
    "2": "Version",
    "3": "Status",
    "4": "Owner"
  },
  "fields": {
    "1": "Production",
    "2": "v2.0",
    "3": "Active",
    "4": "DevOps Team"
  },
  "monitor": {
    "baseUrl": "https://api.example.com",
    "login": { ... },
    "tests": [ ... ],
    "schedule": { ... }
  }
}
```

### Monitor Configuration

```json
{
  "baseUrl": "https://api.example.com",
  "login": {
    "enabled": true,
    "path": "/auth/login",
    "method": "POST",
    "username": "user@example.com",
    "password": "password123",
    "bodyTemplate": "{\"email\":\"${username}\",\"password\":\"${password}\"}",
    "tokenLocation": "json:token",
    "tokenHeaderName": "Authorization",
    "tokenPrefix": "Bearer ",
    "persistPassword": true
  },
  "tests": [
    {
      "id": "test-001",
      "name": "Get User Profile",
      "required": true,
      "requiresLogin": true,
      "method": "GET",
      "path": "/users/me",
      "expectedStatus": [200],
      "bodyTemplate": "",
      "headers": {}
    }
  ],
  "schedule": {
    "enabled": true,
    "intervalSec": 300
  }
}
```

---

## 🔐 Authentication & Tokens

### Supported Authentication Methods

#### 1. JWT Bearer Token

```json
{
  "login": {
    "enabled": true,
    "path": "/auth/login",
    "method": "POST",
    "bodyTemplate": "{\"username\":\"${username}\",\"password\":\"${password}\"}",
    "tokenLocation": "json:token",
    "tokenHeaderName": "Authorization",
    "tokenPrefix": "Bearer "
  }
}
```

#### 2. API Key in Header

```json
{
  "login": {
    "enabled": true,
    "path": "/auth/key",
    "method": "POST",
    "tokenLocation": "json:apiKey",
    "tokenHeaderName": "X-API-Key",
    "tokenPrefix": ""
  }
}
```

#### 3. Token in Response Header

```json
{
  "login": {
    "enabled": true,
    "path": "/auth/login",
    "method": "POST",
    "tokenLocation": "header:X-Auth-Token",
    "tokenHeaderName": "Authorization",
    "tokenPrefix": "Token "
  }
}
```

### Token Location Formats

| Format | Description | Example |
|--------|-------------|---------|
| `json:token` | Extract from JSON response | `{"token": "abc123"}` |
| `json:data.token` | Nested JSON path | `{"data": {"token": "abc123"}}` |
| `json:auth.accessToken` | Deep nested path | `{"auth": {"accessToken": "abc123"}}` |
| `header:Authorization` | From response header | `Authorization: Bearer abc123` |
| `header:X-Auth-Token` | Custom header | `X-Auth-Token: abc123` |

### Token Persistence

Tokens are automatically:
- ✅ Saved to `localStorage` after successful login
- ✅ Loaded on page refresh
- ✅ Reused for subsequent test runs
- ✅ Cleared when login fails

**Storage Location:**
```javascript
localStorage.projectsData[index].monitor.state.token
```

---

## 🧪 Test Management

### Test Configuration

```json
{
  "id": "test-001",
  "name": "Create User",
  "required": true,
  "requiresLogin": true,
  "method": "POST",
  "path": "/users",
  "expectedStatus": [201],
  "bodyTemplate": "{\"name\":\"John Doe\",\"email\":\"john@example.com\"}",
  "headers": {
    "Content-Type": "application/json"
  }
}
```

### Test Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique test identifier |
| `name` | string | Yes | Human-readable test name |
| `required` | boolean | No | If true, failure causes overall FAIL |
| `requiresLogin` | boolean | No | If true, uses authentication token |
| `method` | string | Yes | HTTP method (GET, POST, PUT, PATCH, DELETE) |
| `path` | string | Yes | API endpoint path |
| `expectedStatus` | array | No | Expected HTTP status codes (default: [200]) |
| `bodyTemplate` | string | No | Request body with variable substitution |
| `headers` | object | No | Custom headers for this test |

### Variable Substitution

Use `${variable}` syntax in `bodyTemplate`:

```json
{
  "bodyTemplate": "{\"username\":\"${username}\",\"password\":\"${password}\",\"timestamp\":\"${timestamp}\",\"random\":\"${random}\",\"lastCreatedId\":\"${lastCreatedId}\"}"
}
```

**Available Variables:**
- `${username}` - From login configuration
- `${password}` - From login configuration
- `${token}` - Current authentication token
- `${timestamp}` - Current ISO timestamp
- `${random}` - Random 6-digit number
- `${lastCreatedId}` - ID from last POST/PUT response

---

## 🔄 Workflows

### Workflow 1: Simple API Monitoring

```
1. Configure base URL
2. Add GET tests
3. Set expected status codes
4. Enable scheduling
5. Monitor results
```

**Example:**
```json
{
  "baseUrl": "https://api.example.com",
  "login": { "enabled": false },
  "tests": [
    {
      "name": "Health Check",
      "method": "GET",
      "path": "/health",
      "expectedStatus": [200]
    }
  ],
  "schedule": {
    "enabled": true,
    "intervalSec": 60
  }
}
```

### Workflow 2: Authenticated CRUD Operations

```
1. Configure authentication
2. Add login test
3. Add CRUD tests with requiresLogin: true
4. Run tests
5. Token automatically saved and reused
```

**Example:**
```json
{
  "baseUrl": "https://api.example.com",
  "login": {
    "enabled": true,
    "path": "/auth/login",
    "method": "POST",
    "username": "user@example.com",
    "password": "password123",
    "bodyTemplate": "{\"email\":\"${username}\",\"password\":\"${password}\"}",
    "tokenLocation": "json:token",
    "tokenHeaderName": "Authorization",
    "tokenPrefix": "Bearer "
  },
  "tests": [
    {
      "name": "Get Profile",
      "requiresLogin": true,
      "method": "GET",
      "path": "/users/me",
      "expectedStatus": [200]
    },
    {
      "name": "Update Profile",
      "requiresLogin": true,
      "method": "PUT",
      "path": "/users/me",
      "expectedStatus": [200],
      "bodyTemplate": "{\"name\":\"Updated Name\"}"
    }
  ]
}
```

### Workflow 3: Multi-Step Test Flow

```
1. Login → Get Token
2. Create Resource → Get ID
3. Update Resource (using ${lastCreatedId})
4. Delete Resource (using ${lastCreatedId})
```

**Example:**
```json
{
  "tests": [
    {
      "name": "Create Post",
      "method": "POST",
      "path": "/posts",
      "bodyTemplate": "{\"title\":\"Test Post\",\"body\":\"Content\"}",
      "expectedStatus": [201]
    },
    {
      "name": "Update Post",
      "method": "PUT",
      "path": "/posts/${lastCreatedId}",
      "bodyTemplate": "{\"title\":\"Updated Post\"}",
      "expectedStatus": [200]
    },
    {
      "name": "Delete Post",
      "method": "DELETE",
      "path": "/posts/${lastCreatedId}",
      "expectedStatus": [200]
    }
  ]
}
```

---

## 📚 Examples

### Example 1: JSONPlaceholder (No Auth)

```json
{
  "name": "JSONPlaceholder Test",
  "url": "https://jsonplaceholder.typicode.com",
  "monitor": {
    "baseUrl": "https://jsonplaceholder.typicode.com",
    "login": { "enabled": false },
    "tests": [
      {
        "id": "test-001",
        "name": "GET Posts",
        "method": "GET",
        "path": "/posts",
        "expectedStatus": [200]
      },
      {
        "id": "test-002",
        "name": "CREATE Post",
        "method": "POST",
        "path": "/posts",
        "expectedStatus": [201],
        "bodyTemplate": "{\"title\":\"Test\",\"body\":\"Content\",\"userId\":1}",
        "headers": {
          "Content-Type": "application/json"
        }
      }
    ]
  }
}
```

### Example 2: DummyJSON (JWT Auth)

```json
{
  "name": "DummyJSON Auth Test",
  "url": "https://dummyjson.com",
  "monitor": {
    "baseUrl": "https://dummyjson.com",
    "login": {
      "enabled": true,
      "path": "/auth/login",
      "method": "POST",
      "username": "emilys",
      "password": "emilyspass",
      "bodyTemplate": "{\"username\":\"${username}\",\"password\":\"${password}\",\"expiresInMins\":30}",
      "tokenLocation": "json:accessToken",
      "tokenHeaderName": "Authorization",
      "tokenPrefix": "Bearer "
    },
    "tests": [
      {
        "id": "test-001",
        "name": "GET Current User",
        "requiresLogin": true,
        "method": "GET",
        "path": "/auth/me",
        "expectedStatus": [200]
      }
    ]
  }
}
```

### Example 3: Custom API with Nested Token

```json
{
  "name": "Custom API",
  "url": "https://api.custom.com",
  "monitor": {
    "baseUrl": "https://api.custom.com",
    "login": {
      "enabled": true,
      "path": "/v1/auth/login",
      "method": "POST",
      "username": "admin",
      "password": "secret",
      "bodyTemplate": "{\"credentials\":{\"username\":\"${username}\",\"password\":\"${password}\"}}",
      "tokenLocation": "json:data.auth.token",
      "tokenHeaderName": "X-API-Token",
      "tokenPrefix": ""
    },
    "tests": [
      {
        "id": "test-001",
        "name": "GET Dashboard",
        "requiresLogin": true,
        "method": "GET",
        "path": "/v1/dashboard",
        "expectedStatus": [200]
      }
    ]
  }
}
```

---

## 📖 API Reference

### Test Status Values

| Status | Description |
|--------|-------------|
| `pass` | Test passed successfully |
| `fail` | Test failed (wrong status code or error) |
| `unknown` | Test not run or inconclusive |

### Overall Status Logic

| Condition | Overall Status |
|-----------|----------------|
| All tests pass | `pass` |
| Any required test fails | `fail` |
| All required tests pass, some optional fail | `partial` |
| No tests configured or not run | `unknown` |

### Error Codes

| Error | Description |
|-------|-------------|
| `network` | Network error or timeout |
| `cors-opaque` | CORS policy blocked request |
| `timeout` | Request exceeded 15 second timeout |
| `aborted` | Request manually canceled |
| `token-missing` | Token not found in response |
| `http-XXX` | HTTP error (e.g., `http-401`, `http-500`) |
| `missing-base-url` | Base URL not configured |
| `auth-missing` | Authentication required but not available |

---

## 🔧 Troubleshooting

### Token Not Saving

**Problem:** Token extracted but not persisting between runs.

**Solution:**
1. Check `tokenLocation` matches API response structure
2. Verify `persistRunResult()` is called after tests
3. Check browser console for localStorage errors
4. Ensure not in incognito/private mode

**Debug:**
```javascript
// Check token in localStorage
const data = JSON.parse(localStorage.getItem('projectsData'));
console.log('Token:', data[0].monitor.state.token);
```

### Login Fails with 401

**Problem:** Login request returns 401 Unauthorized.

**Solution:**
1. Verify username/password are correct
2. Check `bodyTemplate` matches API requirements
3. Ensure `Content-Type` header is set
4. Check API documentation for required fields

**Debug:**
```javascript
// Check login request in Network tab
// Look for Request Payload and Response
```

### CORS Errors

**Problem:** Browser blocks requests due to CORS policy.

**Solution:**
1. Use APIs that support CORS
2. Run through a proxy server
3. Use browser extension to disable CORS (development only)
4. Configure API server to allow CORS

### Tests Not Running

**Problem:** Tests show "NOT RUN" status.

**Solution:**
1. Ensure base URL is configured
2. Check if login is required but not configured
3. Verify test paths are correct
4. Check browser console for errors

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/yourusername/api-monitoring-dashboard.git

# Create feature branch
git checkout -b feature/my-feature

# Make changes and test locally
python -m http.server 8000

# Commit and push
git add .
git commit -m "Description of changes"
git push origin feature/my-feature
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Inspired by Postman and similar API testing tools
- Built with vanilla JavaScript for maximum compatibility
- Uses localStorage for client-side persistence
- No external dependencies required

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/api-monitoring-dashboard/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/api-monitoring-dashboard/discussions)
- **Email:** support@example.com

---

**Made with ❤️ by the AY&AI**
