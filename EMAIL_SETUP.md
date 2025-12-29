# Email Setup Troubleshooting Guide

## Connection Timeout Error (ETIMEDOUT)

If you're getting connection timeout errors, try these solutions:

### Solution 1: Use Port 465 with SSL (Recommended)
Update your `.env` file:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Solution 2: Check Firewall/Antivirus
- Temporarily disable Windows Firewall
- Check if your antivirus is blocking SMTP connections
- Try running your backend with elevated permissions

### Solution 3: Use Gmail App Password
1. Go to: https://myaccount.google.com/apppasswords
2. Enable 2-Step Verification first if not enabled
3. Generate an App Password for "Mail"
4. Use this 16-character password as `SMTP_PASS` (not your regular password)

### Solution 4: Try Alternative Email Providers

#### SendGrid (Free tier: 100 emails/day)
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@yourdomain.com
```

#### Mailgun (Free tier: 5,000 emails/month)
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@yourdomain.mailgun.org
SMTP_PASS=your-mailgun-password
SMTP_FROM=noreply@yourdomain.com
```

#### Outlook/Hotmail
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```

## Testing Email Connection

The email service will automatically verify the connection on startup. Check your logs for:
- ✅ `SMTP server is ready to send emails` - Connection successful
- ❌ `SMTP configuration error` - Check your settings

## Current Settings

Your current configuration:
- Port 587 is often blocked by ISPs or firewalls
- Try port 465 (SSL) instead
- Ensure you're using App Password for Gmail (not regular password)

