# Privacy Policy - Weather MCP Analytics

**Effective Date:** 2025-01-13
**Last Updated:** 2025-01-13
**Version:** 1.0.0

---

## Overview

The Weather MCP Analytics Server is a **privacy-first analytics collection system** designed to help improve the Weather MCP server while strictly protecting user privacy. This privacy policy explains what data we collect, how we use it, and the measures we take to protect your privacy.

**Core Principle:** We collect ONLY anonymous, aggregated usage statistics. We never collect, store, or process any personally identifiable information (PII).

---

## Summary of Privacy Guarantees

✅ **No Personal Information**: We never collect names, emails, phone numbers, or user IDs
✅ **No Location Data**: We never collect coordinates, addresses, cities, or specific locations
✅ **No IP Address Logging**: Application and reverse proxy configured to never log IP addresses
✅ **No User Tracking**: We cannot identify or track individual users
✅ **Anonymous Only**: All data is truly anonymous and cannot be linked to individuals
✅ **Opt-In by Default**: Analytics are disabled by default; users must explicitly enable them
✅ **Open Source**: All collection code is open source and auditable
✅ **Transparent**: Complete transparency about what we collect and why

---

## What Information We Collect

### Anonymous Usage Analytics

When you enable analytics in your Weather MCP server (opt-in), we collect anonymous usage statistics at one of three levels:

#### Level 1: Minimal (Default if enabled)

- **MCP Server Version** (e.g., "1.6.1")
- **Tool Used** (e.g., "get_forecast", "get_current_conditions")
- **Request Status** ("success" or "error")
- **Timestamp** (rounded to the nearest hour for anonymity)

**Example minimal event:**
```json
{
  "version": "1.6.1",
  "tool": "get_forecast",
  "status": "success",
  "timestamp_hour": "2025-01-13T10:00:00Z",
  "analytics_level": "minimal"
}
```

#### Level 2: Standard

All minimal data plus:

- **Response Time** (milliseconds)
- **Service Used** (e.g., "noaa", "openmeteo")
- **Cache Hit/Miss** (boolean)
- **Country Code** (ISO 3166-1 alpha-2, e.g., "US", "GB")

Note: Country code is derived from the requesting IP address but the IP address itself is NEVER stored.

**Example standard event:**
```json
{
  "version": "1.6.1",
  "tool": "get_forecast",
  "status": "success",
  "timestamp_hour": "2025-01-13T10:00:00Z",
  "analytics_level": "standard",
  "response_time_ms": 145,
  "service": "noaa",
  "cache_hit": true,
  "country": "US"
}
```

#### Level 3: Detailed

All standard data plus:

- **Error Type** (if request failed)
- **Anonymous Parameters** (sanitized tool parameters with NO coordinates or locations)

**Example detailed event:**
```json
{
  "version": "1.6.1",
  "tool": "get_forecast",
  "status": "error",
  "timestamp_hour": "2025-01-13T10:00:00Z",
  "analytics_level": "detailed",
  "error_type": "network_error",
  "service": "noaa",
  "country": "US"
}
```

---

## What Information We DO NOT Collect

We have implemented multiple layers of protection to ensure we NEVER collect personal information:

### Explicitly Prohibited Data

❌ **Location Information:**
- No coordinates (latitude, longitude)
- No addresses
- No cities, zip codes, or postal codes
- No location names of any kind

❌ **Personal Identifiers:**
- No names
- No email addresses
- No phone numbers
- No user IDs or account identifiers
- No IP addresses (not logged or stored)
- No device identifiers
- No session IDs that could track users

❌ **User Content:**
- No query text
- No weather data requested
- No API responses
- No user-generated content

### Technical Safeguards

We enforce these restrictions through:

1. **Automatic PII Detection**: Events containing any PII fields are automatically rejected before processing
2. **No IP Logging**: Application configured to never log IP addresses
3. **Nginx Privacy Configuration**: Reverse proxy configured with privacy-first logging (no IPs)
4. **Parameter Sanitization**: Tool parameters are sanitized to remove any location data
5. **Timestamp Rounding**: Timestamps rounded to the nearest hour to prevent timing-based identification
6. **Schema Validation**: Strict TypeScript/Zod schemas enforce data structure

---

## How We Use Your Information

### Purpose of Data Collection

We collect anonymous analytics ONLY to:

1. **Understand Tool Usage**: Which weather tools are most/least used
2. **Improve Performance**: Identify slow operations and optimize them
3. **Reduce Errors**: Detect and fix common error patterns
4. **Guide Development**: Prioritize features based on actual usage
5. **Measure Adoption**: Track Weather MCP server adoption and growth

### How We Use Collected Data

- **Aggregation**: All data is aggregated into summary statistics
- **Public Dashboard**: Display aggregated statistics on https://weather-mcp.dev/dashboard
- **Performance Analysis**: Analyze response times and error rates
- **Feature Planning**: Decide which features to develop next
- **Bug Detection**: Identify error patterns to fix bugs

### How We DO NOT Use Your Data

❌ We do NOT:
- Sell your data to third parties
- Share data with advertisers
- Use data for marketing purposes
- Track individual users
- Build user profiles
- Share raw event data externally
- Use data for any purpose other than improving Weather MCP

---

## Data Storage and Security

### Data Storage

- **Location**: All data is stored on secure servers in the United States
- **Database**: PostgreSQL with TimescaleDB extension for time-series data
- **Encryption**: Data encrypted in transit (TLS 1.2+) and at rest
- **Access Control**: Strict access controls on database and infrastructure

### Data Retention

We automatically delete data according to these retention policies:

| Data Type | Retention Period | Auto-Deletion |
|-----------|------------------|---------------|
| **Raw Events** | 90 days | ✅ Yes (automatic) |
| **Hourly Aggregations** | 30 days | ✅ Yes (automatic) |
| **Daily Aggregations** | 2 years | ✅ Yes (automatic) |
| **Error Summaries** | 90 days | ✅ Yes (automatic) |

Old data is automatically deleted using TimescaleDB retention policies. No manual intervention required.

### Security Measures

- **TLS Encryption**: All API requests use HTTPS (TLS 1.2+ only)
- **Rate Limiting**: 60 requests/minute per IP to prevent abuse
- **Input Validation**: Strict validation of all incoming data
- **PII Detection**: Automatic rejection of events containing PII
- **Firewall**: Server protected by firewall (UFW)
- **DDoS Protection**: Cloudflare DDoS protection (optional)
- **Regular Backups**: Daily automated backups with 7-day retention
- **Monitoring**: 24/7 system monitoring with alerts
- **Security Updates**: Regular security updates and patches
- **Dependency Scanning**: Automated vulnerability scanning with npm audit

---

## Your Privacy Rights

### Opt-In System

- **Disabled by Default**: Analytics are DISABLED by default in Weather MCP servers
- **Explicit Consent**: Users must explicitly enable analytics in their configuration
- **Easy Opt-Out**: Users can disable analytics at any time
- **No Penalty**: Disabling analytics does not affect Weather MCP functionality

### How to Enable Analytics

In your Weather MCP server configuration:

```json
{
  "analytics": {
    "enabled": true,
    "level": "minimal",  // or "standard" or "detailed"
    "endpoint": "https://analytics.weather-mcp.dev/v1/events"
  }
}
```

### How to Disable Analytics

Set `"enabled": false` in your configuration or remove the analytics section entirely.

### Your Rights

Since we collect only anonymous data that cannot be linked to individuals:

- **Right to Access**: There is no personal data to access
- **Right to Deletion**: No personal data to delete
- **Right to Portability**: No personal data to export
- **Right to Rectification**: No personal data to correct

However, you always have the right to:
- ✅ **Opt out** of analytics collection at any time
- ✅ **Choose your analytics level** (minimal, standard, or detailed)
- ✅ **View source code** to verify privacy claims
- ✅ **Review aggregated statistics** on the public dashboard
- ✅ **Request information** about our privacy practices

---

## Data Sharing and Third Parties

### We Do Not Share Your Data

We do NOT share, sell, or transfer your data to third parties, with the following exceptions:

1. **Public Dashboard**: Aggregated statistics are displayed publicly at https://weather-mcp.dev/dashboard
   - Only summary statistics (e.g., "10,000 forecast requests in the last 30 days")
   - No individual events or raw data
   - No personally identifiable information

2. **Infrastructure Providers**: We use the following third-party services for infrastructure:
   - **Cloud Hosting**: DigitalOcean or similar VPS provider (data storage only)
   - **CDN/DDoS Protection**: Cloudflare (optional, traffic routing only)
   - **Monitoring**: Prometheus + Grafana (self-hosted, no external service)

3. **Open Source**: Raw event schemas and aggregation logic are open source and publicly available

### No Third-Party Analytics

We do NOT use third-party analytics services like:
- ❌ Google Analytics
- ❌ Facebook Pixel
- ❌ Advertising networks
- ❌ Data brokers
- ❌ Marketing platforms

---

## Cookies and Tracking

### API Server

The Analytics Server API does NOT use:
- ❌ Cookies
- ❌ Session tokens
- ❌ Browser fingerprinting
- ❌ Tracking pixels
- ❌ Local storage
- ❌ Any client-side tracking

### Public Dashboard Website

The public dashboard website (weather-mcp.dev) may use:
- ✅ Essential cookies for functionality (if needed)
- ❌ NO tracking cookies
- ❌ NO advertising cookies
- ❌ NO third-party analytics cookies

---

## Children's Privacy

The Weather MCP Analytics Server is not directed at children under 13 years of age. We do not knowingly collect data from children. Since we collect only anonymous usage statistics with no personal identifiers, we cannot determine the age of users.

If you believe we have inadvertently collected data from a child, please contact us and we will investigate.

---

## International Data Transfers

### Data Location

All data is stored on servers located in the United States.

### International Users

If you are accessing Weather MCP from outside the United States:
- Your anonymous analytics events will be transmitted to servers in the United States
- Only anonymous, aggregated data is collected (no PII)
- All data is encrypted in transit (TLS 1.2+)
- No IP addresses are logged or stored

### GDPR Compliance (EU Users)

For users in the European Union:
- **Lawful Basis**: Legitimate interest (improving software)
- **No PII**: We do not collect personal data as defined by GDPR
- **Anonymous Data**: Recital 26 of GDPR states that principles do not apply to anonymous data
- **Right to Object**: You can opt out of analytics collection at any time
- **Data Controller**: Weather MCP Project (see Contact Information below)

### Other Jurisdictions

We strive to comply with privacy regulations worldwide, including:
- **CCPA (California)**: No personal information sold or shared
- **PIPEDA (Canada)**: No personal information collected
- **Privacy Act (Australia)**: Anonymous data collection only

---

## Changes to This Privacy Policy

### Notification of Changes

We may update this privacy policy from time to time. When we make changes:

1. **Version Update**: The version number and "Last Updated" date will be updated
2. **Notification**: Significant changes will be announced on our website and GitHub
3. **Review Period**: Users will have 30 days to review changes before they take effect
4. **Opt-Out**: If you disagree with changes, you can opt out of analytics

### History of Changes

- **Version 1.0.0** (2025-01-13): Initial privacy policy for launch

---

## Transparency and Auditability

### Open Source

All analytics collection code is open source and available for review:
- **Analytics Server**: https://github.com/weather-mcp/analytics-server
- **MCP Server (Analytics Integration)**: https://github.com/weather-mcp/mcp-server
- **Website Dashboard**: https://github.com/weather-mcp/website

### Verify Our Claims

You can verify our privacy claims by:

1. **Reviewing Source Code**: All collection and processing code is open source
2. **Inspecting Network Traffic**: Monitor network requests from your MCP server
3. **Reading Tests**: Our test suite validates PII detection and rejection
4. **Checking Logs**: Review structured logs (no IP addresses present)
5. **Testing PII Rejection**: Submit events with PII and observe rejection

### Security Audit

Our codebase has been:
- ✅ Reviewed for security vulnerabilities (npm audit)
- ✅ Tested with 266 automated tests (100% pass rate)
- ✅ Configured with privacy-first logging
- ✅ Implemented with strict input validation
- ✅ Designed with PII detection and rejection

---

## Contact Information

### Data Controller

**Weather MCP Project**
Analytics Server Team

### Contact Methods

- **GitHub Issues**: https://github.com/weather-mcp/analytics-server/issues
- **GitHub Discussions**: https://github.com/weather-mcp/.github/discussions
- **Email**: analytics@weather-mcp.dev *(coming soon)*

### Privacy Questions

For questions about this privacy policy or our data practices:
1. Open a GitHub issue with the "privacy" label
2. Contact us through GitHub Discussions
3. Review our open source code for technical details

---

## Legal Information

### Disclaimer

The Weather MCP Analytics Server is provided "as is" without warranty of any kind. See the [LICENSE](LICENSE) file for full terms.

### Governing Law

This privacy policy is governed by the laws of the United States.

### Severability

If any provision of this privacy policy is found to be unenforceable, the remaining provisions will remain in full effect.

---

## Summary

**In Plain English:**

We collect anonymous usage statistics to improve Weather MCP. We:
- ✅ Collect only anonymous tool usage (which tools, when, success/error)
- ✅ Display aggregated statistics publicly
- ✅ Never collect personal information, locations, or IP addresses
- ✅ Make analytics opt-in (disabled by default)
- ✅ Open source all code for transparency
- ✅ Automatically delete old data
- ✅ Encrypt all data in transit and at rest
- ✅ Allow you to opt out at any time

We believe in radical transparency and privacy. If you have any concerns, please review our open source code or contact us.

---

**Privacy Policy Version:** 1.0.0
**Effective Date:** 2025-01-13
**Last Updated:** 2025-01-13
**Maintained by:** Weather MCP Team

**License:** This privacy policy is released under MIT License
