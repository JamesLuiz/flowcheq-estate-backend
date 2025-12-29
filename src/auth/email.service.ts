import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly frontendUrl: string;
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.frontendUrl =
      this.configService.get<string>('CLIENT_ORIGIN') ||
      'http://localhost:5173';

    // Initialize nodemailer transporter
    const smtpHost = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const smtpPort = parseInt(this.configService.get<string>('SMTP_PORT') || '587', 10);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const smtpSecure = this.configService.get<string>('SMTP_SECURE') === 'true';

    if (smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        connectionTimeout: 30000, // 30 seconds timeout (increased from 10s)
        greetingTimeout: 30000,
        socketTimeout: 30000,
        // Retry configuration
        pool: true, // Use connection pooling
        maxConnections: 1,
        maxMessages: 3,
        // Allow self-signed certificates for development
        tls: {
          rejectUnauthorized: false,
        },
        // Additional options for better connection handling
        requireTLS: !smtpSecure, // Require TLS for non-secure ports
        debug: false, // Set to true for verbose logging
      });

      // Verify transporter configuration (async, don't block)
      this.transporter.verify().then(() => {
        this.logger.log(`SMTP server is ready to send emails (${smtpHost}:${smtpPort})`);
      }).catch((error) => {
        this.logger.error('SMTP configuration error:', error);
        this.logger.warn('Email sending may fail. Check your network connection and SMTP settings.');
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ESOCKET') {
          this.logger.warn('Connection timeout. This could be due to:');
          this.logger.warn('1. Firewall blocking port ' + smtpPort);
          this.logger.warn('2. Network restrictions or ISP blocking SMTP');
          this.logger.warn('3. Try using port 465 with SMTP_SECURE=true');
          this.logger.warn('4. Or use a different email provider (SendGrid, Mailgun, etc.)');
          this.logger.warn('5. Check if antivirus is blocking SMTP connections');
        }
      });
    } else {
      this.logger.warn(
        'SMTP credentials not configured. Email sending will be disabled. Set SMTP_USER and SMTP_PASS environment variables.',
      );
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string, name?: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;
    const fromEmail =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@houseme.com';

    const emailBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            a { color: #667eea; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Reset Your Password</h1>
            </div>
            <div class="content">
              <p>Hello ${name || 'there'},</p>
              <p>We received a request to reset your password for your account. Click the button below to reset your password:</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
              <p>This link will expire in 1 hour.</p>
              <p>If you didn't request a password reset, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(
        `Email sending is disabled. Would send password reset email to: ${email}`,
      );
      this.logger.log(`Reset URL: ${resetUrl}`);
      return { success: false, resetUrl };
    }

    const mailOptions = {
      from: `"House Me" <${fromEmail}>`,
      to: email,
      subject: 'Reset Your Password',
      html: emailBody,
    };

    // Retry logic for connection issues
    let lastError: any;
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const info = await this.transporter.sendMail(mailOptions);
        this.logger.log(`Password reset email sent to: ${email} (MessageId: ${info.messageId})`);
        return { success: true, resetUrl, messageId: info.messageId };
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on authentication errors
        if (error.code === 'EAUTH') {
          this.logger.error('Authentication failed. Check your SMTP_USER and SMTP_PASS');
          this.logger.error('For Gmail: Use an App Password, not your regular password');
          break;
        }

        // Retry on connection errors
        if ((error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ESOCKET') && attempt < maxRetries) {
          this.logger.warn(`Attempt ${attempt}/${maxRetries} failed. Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt)); // Exponential backoff
          continue;
        }

        // If not a retryable error or max retries reached, break
        break;
      }
    }

    // All retries failed
    this.logger.error(`Failed to send password reset email to ${email} after ${maxRetries} attempts:`, lastError);
    
    // Provide helpful error messages
    if (lastError.code === 'ETIMEDOUT' || lastError.code === 'ECONNREFUSED' || lastError.code === 'ESOCKET') {
      this.logger.error('Connection timeout/refused. Possible solutions:');
      this.logger.error('1. Check your internet connection');
      this.logger.error('2. Try using port 465 with SMTP_SECURE=true');
      this.logger.error('3. Check if your firewall/antivirus is blocking SMTP');
      this.logger.error('4. For Gmail: Ensure you\'re using an App Password (not regular password)');
      this.logger.error('5. Try a different email provider (SendGrid, Mailgun, etc.)');
      this.logger.error('6. Check if your ISP is blocking SMTP ports');
    } else if (lastError.code === 'EAUTH') {
      this.logger.error('Authentication failed. Check your SMTP_USER and SMTP_PASS');
      this.logger.error('For Gmail: Use an App Password, not your regular password');
    }
    
    // Don't throw error - just log it and return failure
    // This way the user still gets a response (security best practice)
    return { success: false, resetUrl, error: lastError.message };
  }
}

