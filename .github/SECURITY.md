# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.3.x   | :white_check_mark: |
| < 2.3   | :x:                |

## Reporting a Vulnerability

We take the security of LittleAIBox seriously. If you believe you have found a security vulnerability, please report it privately.

### Please do NOT:
- Open a public GitHub issue
- Discuss in public channels

### Please DO:
**Email**: diandiancha101@gmail.com  
**Subject**: `[SECURITY]` - Brief description

Include:
- Type of vulnerability
- Affected files/paths
- Steps to reproduce
- Potential impact

### Response Timeline
- **Initial Response**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix Timeline**: Critical (24h) | High (7d) | Medium (30d) | Low (next release)

## Key Security Features

### Client-Side
- **Local Processing**: All file parsing happens in your browser
- **No Upload**: Files never leave your device
- **IndexedDB**: Chat history stored locally
- **API Key Isolation**: User keys stored separately

### Backend
- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: Industry-standard bcrypt
- **HTTPS Only**: All communications encrypted
- **Rate Limiting**: DDoS protection
- **API Key Rotation**: Multi-key management with failover

### Infrastructure
- **Cloudflare**: DDoS protection & WAF
- **CSP Headers**: Content Security Policy
- **No Logging**: Minimal data collection
- **Regular Audits**: Security reviews

## Security Best Practices

When using LittleAIBox:

1. **Use Your Own API Keys** - Always use your own Gemini API keys
2. **Never Commit Keys** - Keep API keys in environment variables
3. **Stay Updated** - Regularly update to the latest version
4. **Strong Passwords** - Use unique, strong passwords
5. **HTTPS Only** - Always use HTTPS in production

## Contact

- **Email**: diandiancha101@gmail.com
- **GitHub**: [@diandiancha](https://github.com/diandiancha)

---

**Last Updated**: January 2025
