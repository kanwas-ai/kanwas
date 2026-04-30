---
name: api-endpoint-doc
description: Transform API endpoint code, specs, or descriptions into developer-friendly documentation. Use when you need to document REST or GraphQL endpoints so that consuming developers can integrate without asking questions or reading source code.
---

# API Endpoint Documentation

Transform endpoint code or specs into documentation developers can use immediately.

## What Good Looks Like

- **Self-sufficient** — Developer can integrate without reading source code or asking questions
- **Request complete** — URL, method, auth, headers, params, body all documented
- **Response complete** — Success and error responses with actual status codes
- **Examples work** — Copy-paste curl/code examples that actually run
- **Edge cases visible** — Rate limits, pagination, auth errors documented
- **No implementation leak** — Documents behavior, not internal architecture

## Process

1. **Identify the endpoint basics:**
   - HTTP method (GET, POST, PUT, PATCH, DELETE)
   - URL path with parameter placeholders
   - Purpose in one sentence

2. **Document authentication:**
   - Auth type (API key, Bearer token, OAuth, none)
   - Where it goes (header, query param, body)
   - Example format

3. **Document request:**
   - Path parameters (required)
   - Query parameters (with defaults, types, constraints)
   - Request body schema (with required/optional fields)
   - Headers (Content-Type, custom headers)

4. **Document response:**
   - Success response (status code + body schema)
   - Error responses (common codes: 400, 401, 403, 404, 422, 429, 500)
   - Response headers if relevant (pagination, rate limit)

5. **Add working example:**
   - Curl command that actually works
   - Example response body

6. **Document edge cases:**
   - Rate limits and how they're communicated
   - Pagination (if list endpoint)
   - Idempotency (if mutation endpoint)

## Output Format

````markdown
## [Endpoint Name]

[One sentence: what this endpoint does]

### Request

`[METHOD] /path/{param}`

#### Authentication

[Auth type and where to include it]

#### Path Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| param     | string | Yes      | Description |

#### Query Parameters

| Parameter | Type | Default | Description         |
| --------- | ---- | ------- | ------------------- |
| limit     | int  | 20      | Max items to return |

#### Request Body

```json
{
  "field": "value"
}
```
````

| Field | Type   | Required | Description |
| ----- | ------ | -------- | ----------- |
| field | string | Yes      | Description |

### Response

#### Success (200 OK)

```json
{
  "data": {}
}
```

#### Errors

| Code | Meaning      | When                    |
| ---- | ------------ | ----------------------- |
| 400  | Bad Request  | Invalid parameters      |
| 401  | Unauthorized | Missing or invalid auth |
| 404  | Not Found    | Resource doesn't exist  |

### Example

```bash
curl -X GET "https://api.example.com/v1/resource/123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:

```json
{
  "id": "123",
  "name": "Example"
}
```

### Notes

[Rate limits, pagination, idempotency, deprecation, etc.]

```

## Quality Check

Before delivering:

- [ ] **Can copy-paste curl** — Example works without modification (except auth token)
- [ ] **All parameters documented** — No undocumented query params or body fields
- [ ] **Error responses included** — At least 400, 401, 404 for most endpoints
- [ ] **Types specified** — Every parameter has a type (string, int, boolean, etc.)
- [ ] **Required/optional clear** — No ambiguity about what must be provided
- [ ] **No internal jargon** — A new developer understands without context

## Common Mistakes

**Missing auth details:**
- Bad: "Requires authentication"
- Good: "Bearer token in Authorization header: `Authorization: Bearer {token}`"

**Incomplete error responses:**
- Bad: "Returns error on failure"
- Good: "Returns 422 with `{"error": "email_taken", "message": "..."}` when email exists"

**Untested examples:**
- Bad: Curl with placeholder URL that doesn't match actual endpoint
- Good: Curl that matches documented URL pattern exactly

**Type ambiguity:**
- Bad: "id - the user ID"
- Good: "id (string, UUID) - the user's unique identifier"

**Missing constraints:**
- Bad: "limit - number of results"
- Good: "limit (int, 1-100, default: 20) - maximum results to return"
```
