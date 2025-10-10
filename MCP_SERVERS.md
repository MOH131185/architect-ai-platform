# MCP Servers Configuration

This document describes the Model Context Protocol (MCP) servers installed and configured for the architect-ai-platform project.

## What is MCP?

The Model Context Protocol (MCP) is an open standard developed by Anthropic that enables AI assistants to securely connect to external data sources and tools. MCP servers provide specialized capabilities that enhance Claude Code's functionality.

## Installed MCP Servers

### ✅ 1. Playwright MCP Server
**Status:** ✓ Connected
**Package:** `@executeautomation/playwright-mcp-server`
**Purpose:** Browser automation and testing capabilities

**What it does:**
- Navigate to URLs and interact with web pages
- Take screenshots and capture page content
- Fill forms, click elements, and automate workflows
- Execute JavaScript in browser contexts
- Test web applications end-to-end

**Usage in this project:**
- Test the live deployment at www.archiaisolution.pro
- Automate UI testing workflows
- Capture visual regression screenshots
- Debug browser-specific issues

**Available Tools:**
- `playwright_navigate` - Navigate to URLs
- `playwright_screenshot` - Take screenshots
- `playwright_click` - Click elements
- `playwright_fill` - Fill form fields
- `playwright_evaluate` - Execute JavaScript
- `playwright_get_visible_text` - Extract page text
- `playwright_get_visible_html` - Get page HTML

---

### ✅ 2. Filesystem MCP Server
**Status:** ✓ Connected
**Package:** `@modelcontextprotocol/server-filesystem`
**Purpose:** Secure file operations with enhanced capabilities

**What it does:**
- Read and write files with permission controls
- Search file contents across the project
- Navigate directory structures
- Monitor file changes
- Batch file operations

**Configuration:**
```bash
npx -y @modelcontextprotocol/server-filesystem C:/Users/21366/OneDrive/Documents/GitHub/architect-ai-platform
```

**Usage in this project:**
- Enhanced file search across React components
- Bulk file operations (renaming, moving)
- Safe file editing with automatic backups
- Project-wide refactoring support

---

### ✅ 3. Memory MCP Server
**Status:** ✓ Connected
**Package:** `@modelcontextprotocol/server-memory`
**Purpose:** Knowledge graph-based persistent memory system

**What it does:**
- Store context across Claude Code sessions
- Remember project-specific patterns and conventions
- Build knowledge graphs of your codebase
- Maintain conversation history and decisions
- Learn from your coding patterns

**Usage in this project:**
- Remember architectural decisions and why they were made
- Store common code patterns for this project
- Track issues and their resolutions
- Maintain context about API integrations (OpenAI, Replicate, Google Maps)
- Remember deployment configurations

**Examples:**
```bash
# Store a project decision
"Remember that we use SDXL for image generation via Replicate API"

# Retrieve context
"What architectural style database structure did we use?"
```

---

### ✅ 4. GitHub MCP Server
**Status:** ✓ Connected
**Package:** `@modelcontextprotocol/server-github`
**Purpose:** GitHub repository management and automation

**What it does:**
- Create and manage issues
- Work with pull requests
- Search code across repositories
- Manage GitHub Actions workflows
- Handle repository settings
- Automate GitHub operations

**Usage in this project:**
- Create issues for bugs or feature requests
- Review and manage pull requests
- Track project milestones
- Automate release workflows
- Search code history

**GitHub Authentication:**
You may need to authenticate the GitHub MCP server:
```bash
/mcp authenticate github
```

---

### ⚠️ 5. Git MCP Server (Configuration Issue)
**Status:** ✗ Failed to connect
**Package:** `@modelcontextprotocol/server-git`
**Purpose:** Git repository operations and history

**Known Issue:**
The git MCP server is currently having connection issues on Windows. This is a known limitation with the current version. Git operations can still be performed using the standard Bash tool.

**Attempted Configuration:**
```bash
npx -y @modelcontextprotocol/server-git --repository .
```

**Workaround:**
Use the existing `Bash` tool for git operations:
- `git status`
- `git log`
- `git diff`
- `git commit`
- `git push`

---

## Managing MCP Servers

### List All Servers
```bash
claude mcp list
```

### Get Server Details
```bash
claude mcp get <server-name>
```

### Remove a Server
```bash
claude mcp remove <server-name>
```

### Add a New Server
```bash
# HTTP/SSE servers
claude mcp add --transport http <name> <url>

# Local stdio servers
claude mcp add --transport stdio <name> -- <command> [args...]
```

---

## Configuration Files

### Local Configuration
**Location:** `C:\Users\21366\.claude.json`
**Scope:** Project-specific, private to you

### Project Configuration (Shared)
**Location:** `.mcp.json` (in project root)
**Scope:** Shared with team via git

---

## Best Practices

### 1. Playwright Server
- Use for testing deployed features
- Capture screenshots before major releases
- Test cross-browser compatibility
- Automate repetitive UI testing tasks

### 2. Filesystem Server
- Leverage for project-wide refactoring
- Use for bulk file operations
- Safe for reading sensitive files (respects .gitignore)

### 3. Memory Server
- Document major architectural decisions
- Store common patterns and conventions
- Build a knowledge base for the project
- Remember API rate limits and quotas

### 4. GitHub Server
- Automate issue creation from bugs
- Create PRs with comprehensive descriptions
- Track feature implementations
- Monitor Actions workflows

---

## Enhanced Workflow Examples

### Example 1: Automated Testing Workflow
```
1. Use Playwright to navigate to www.archiaisolution.pro
2. Take screenshots of key features
3. Test the AI generation workflow
4. Store results in Memory for tracking
5. Create GitHub issue if bugs found
```

### Example 2: Code Review Workflow
```
1. Use Filesystem to analyze changed files
2. Use Memory to recall coding standards
3. Use GitHub to create review comments
4. Use Memory to store review patterns
```

### Example 3: Deployment Workflow
```
1. Use Filesystem to verify build artifacts
2. Use GitHub to create release PR
3. Use Playwright to test staging deployment
4. Use Memory to document deployment notes
```

---

## Troubleshooting

### Server Not Connecting
1. Check if npm package is available: `npm info <package-name>`
2. Try reinstalling: `claude mcp remove <name> && claude mcp add ...`
3. Check for path issues (use forward slashes on Windows)
4. Verify environment variables if required

### Performance Issues
- MCP servers run as separate processes
- Check system resources if experiencing slowdowns
- Consider removing unused servers

### Authentication Required
Some servers (like GitHub) may require authentication:
```bash
/mcp authenticate <server-name>
```

---

## Future Enhancements

Consider adding these MCP servers as the project grows:

### Database Integration
```bash
claude mcp add --transport stdio postgres -- npx -y @modelcontextprotocol/server-postgres
```

### Cloud Storage
```bash
claude mcp add --transport http aws https://mcp.aws.com/mcp
```

### API Testing
```bash
claude mcp add --transport stdio postman -- npx -y postman-mcp-server
```

---

## Resources

- [MCP Official Documentation](https://docs.claude.com/en/docs/mcp)
- [MCP Servers Repository](https://github.com/modelcontextprotocol/servers)
- [Claude Code MCP Guide](https://docs.claude.com/en/docs/claude-code/mcp)
- [Awesome MCP Servers](https://github.com/wong2/awesome-mcp-servers)

---

## Summary

**Total MCP Servers:** 5
**Successfully Connected:** 4
**Configuration Issues:** 1 (git server - known Windows limitation)

The installed MCP servers significantly enhance Claude Code's capabilities for the architect-ai-platform project, providing:
- ✅ Browser automation and testing (Playwright)
- ✅ Enhanced file operations (Filesystem)
- ✅ Persistent memory and context (Memory)
- ✅ GitHub integration and automation (GitHub)
- ⚠️ Git operations (use Bash tool as fallback)

These tools work together to create a powerful development environment optimized for AI-assisted architecture platform development.
