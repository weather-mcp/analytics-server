# SSL Certificate Setup

This directory should contain your SSL/TLS certificates for HTTPS support.

## Required Files

Place the following files in this directory:

- `fullchain.pem` - Full certificate chain (certificate + intermediates)
- `privkey.pem` - Private key
- `chain.pem` - Intermediate certificates (for OCSP stapling)

## Option 1: Let's Encrypt (Recommended)

Let's Encrypt provides free SSL certificates with automatic renewal.

### Using Certbot

1. **Install Certbot:**
   ```bash
   # On Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install certbot

   # On RHEL/CentOS
   sudo yum install certbot
   ```

2. **Obtain Certificate (Webroot Method):**
   ```bash
   sudo certbot certonly --webroot \
     -w /var/www/certbot \
     -d analytics.weather-mcp.dev \
     --email your-email@example.com \
     --agree-tos
   ```

3. **Copy Certificates:**
   ```bash
   sudo cp /etc/letsencrypt/live/analytics.weather-mcp.dev/fullchain.pem ./fullchain.pem
   sudo cp /etc/letsencrypt/live/analytics.weather-mcp.dev/privkey.pem ./privkey.pem
   sudo cp /etc/letsencrypt/live/analytics.weather-mcp.dev/chain.pem ./chain.pem
   sudo chmod 644 fullchain.pem chain.pem
   sudo chmod 600 privkey.pem
   ```

4. **Set Up Auto-Renewal:**
   ```bash
   # Test renewal
   sudo certbot renew --dry-run

   # Add to crontab (runs twice daily)
   sudo crontab -e
   # Add: 0 0,12 * * * certbot renew --quiet && docker-compose -f /path/to/docker-compose.yml -f /path/to/docker-compose.prod.yml restart nginx
   ```

### Using Docker Certbot

Alternatively, use Certbot in Docker:

```bash
docker run -it --rm --name certbot \
  -v "/etc/letsencrypt:/etc/letsencrypt" \
  -v "/var/lib/letsencrypt:/var/lib/letsencrypt" \
  -v "/var/www/certbot:/var/www/certbot" \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot \
  -d analytics.weather-mcp.dev \
  --email your-email@example.com \
  --agree-tos
```

## Option 2: Cloudflare Origin Certificates

If using Cloudflare, you can use their origin certificates:

1. **Generate Certificate in Cloudflare Dashboard:**
   - Go to SSL/TLS → Origin Server
   - Click "Create Certificate"
   - Select "Generate private key and CSR with Cloudflare"
   - Choose validity period (up to 15 years)

2. **Download Certificates:**
   - Save the origin certificate as `fullchain.pem`
   - Save the private key as `privkey.pem`
   - Download Cloudflare's CA certificate as `chain.pem`

3. **Configure Cloudflare SSL Mode:**
   - Set SSL/TLS encryption mode to "Full (strict)"

## Option 3: Self-Signed Certificate (Development Only)

**WARNING:** Only use for local development. Never use in production.

```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout privkey.pem \
  -out fullchain.pem \
  -subj "/CN=analytics.weather-mcp.dev"

# Create chain file (copy of cert for self-signed)
cp fullchain.pem chain.pem
```

## Verification

After placing certificates, verify them:

```bash
# Check certificate validity
openssl x509 -in fullchain.pem -text -noout

# Check private key matches certificate
openssl x509 -noout -modulus -in fullchain.pem | openssl md5
openssl rsa -noout -modulus -in privkey.pem | openssl md5
# Both should output the same hash

# Test SSL configuration
openssl s_client -connect analytics.weather-mcp.dev:443 -servername analytics.weather-mcp.dev
```

## Security Best Practices

1. **Protect Private Key:**
   ```bash
   chmod 600 privkey.pem
   chown root:root privkey.pem
   ```

2. **Never Commit Private Keys:**
   - The `.gitignore` should already exclude `*.pem` files
   - Double-check before committing

3. **Monitor Expiration:**
   - Set up monitoring for certificate expiration
   - Certificates expire (Let's Encrypt: 90 days)
   - Set up alerts 30 days before expiration

4. **Use Strong Ciphers:**
   - The provided nginx configuration uses modern TLS 1.2+ only
   - Disable legacy protocols (TLS 1.0, 1.1)

## Testing SSL Configuration

Use SSL Labs to test your configuration:

https://www.ssllabs.com/ssltest/analyze.html?d=analytics.weather-mcp.dev

Target grade: A or A+

## Troubleshooting

### Certificate Permissions Error

```bash
sudo chown -R nginx:nginx /etc/nginx/ssl/
sudo chmod 755 /etc/nginx/ssl/
sudo chmod 644 /etc/nginx/ssl/*.pem
sudo chmod 600 /etc/nginx/ssl/privkey.pem
```

### Nginx Won't Start

Check nginx configuration:
```bash
docker-compose exec nginx nginx -t
```

Check certificate paths in `nginx/conf.d/analytics.conf`

### OCSP Stapling Errors

If you see OCSP stapling errors:
1. Verify `chain.pem` exists and is correct
2. Check that your server can reach the OCSP responder
3. Temporarily disable OCSP stapling to test

## Renewal Checklist

- [ ] Certificate expires in < 30 days
- [ ] Run certbot renewal command
- [ ] Verify new certificate with openssl
- [ ] Restart nginx container
- [ ] Test HTTPS connection
- [ ] Verify SSL Labs grade

## Support

- Let's Encrypt: https://letsencrypt.org/docs/
- Certbot: https://certbot.eff.org/
- Nginx SSL: https://nginx.org/en/docs/http/ngx_http_ssl_module.html
