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

  async sendEmail(options: { to: string; subject: string; text?: string; html?: string; from?: string }) {
    const fromEmail =
      options.from ||
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@houseme.com';

    const mailOptions: any = {
      from: `"House Me" <${fromEmail}>`,
      to: options.to,
      subject: options.subject,
    };

    if (options.html) mailOptions.html = options.html;
    if (options.text) mailOptions.text = options.text;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send email to: ${options.to}`);
      this.logger.log(`Subject: ${options.subject}`);
      if (options.text) this.logger.log(`Text: ${options.text}`);
      if (options.html) this.logger.log(`HTML provided`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent to: ${options.to} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      return { success: false, error: error.message };
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

  async sendWelcomeEmail(email: string, name: string, role: 'user' | 'agent' | 'landlord' = 'user') {
    const fromEmail =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@houseme.com';

    const loginUrl = `${this.frontendUrl}/auth`;
    const dashboardUrl = `${this.frontendUrl}/dashboard`;
    const agentGuideUrl = `${this.frontendUrl}/agent-guide`;

    // Role-specific content
    const roleContent = {
      user: {
        subject: `Welcome to House Me, ${name}! 🏠`,
        headerColor: '#16a34a',
        headerText: 'Welcome to House Me! 🏠',
        intro: "Thank you for joining House Me! We're excited to help you find your perfect home.",
        features: `
          <div class="feature">🏘️ Browse thousands of property listings</div>
          <div class="feature">📅 Schedule property viewings</div>
          <div class="feature">🔔 Set up alerts for new properties</div>
          <div class="feature">💬 Connect directly with agents</div>
          <div class="feature">🤝 Find shared properties with 2-to-Tango</div>
        `,
        ctaText: 'Start Exploring',
        ctaUrl: loginUrl,
      },
      agent: {
        subject: `Welcome Agent ${name}! Start Listing Properties 🏢`,
        headerColor: '#3b82f6',
        headerText: 'Welcome to House Me, Agent! 🏢',
        intro: "Congratulations on joining House Me as an Agent! You're now part of Nigeria's premier property marketplace.",
        features: `
          <div class="feature">🏠 List unlimited properties for sale or rent</div>
          <div class="feature">📊 Track your property performance</div>
          <div class="feature">👥 Connect with interested buyers/renters</div>
          <div class="feature">✅ Get verified to boost your credibility</div>
          <div class="feature">📅 Manage property viewings easily</div>
          <div class="feature">🤝 List shared properties (2-to-Tango)</div>
        `,
        ctaText: 'Go to Dashboard',
        ctaUrl: dashboardUrl,
        extraNote: `
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong>⚠️ Important:</strong> Please complete your verification to start listing properties. 
            Verified agents get more visibility and trust from clients.
          </div>
          <p>📖 <a href="${agentGuideUrl}" style="color: #3b82f6;">Read our Agent Guide</a> to learn best practices.</p>
        `,
      },
      landlord: {
        subject: `Welcome Landlord ${name}! List Your Properties 🏡`,
        headerColor: '#8b5cf6',
        headerText: 'Welcome to House Me, Landlord! 🏡',
        intro: "Welcome to House Me! As a landlord, you can now list your properties and connect with potential tenants.",
        features: `
          <div class="feature">🏠 List your properties for rent or sale</div>
          <div class="feature">📊 Manage all your listings in one place</div>
          <div class="feature">👥 Receive inquiries directly from tenants</div>
          <div class="feature">✅ Get verified to increase tenant trust</div>
          <div class="feature">📅 Schedule and manage property viewings</div>
          <div class="feature">🤝 Offer shared living arrangements</div>
        `,
        ctaText: 'Go to Dashboard',
        ctaUrl: dashboardUrl,
        extraNote: `
          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong>⚠️ Important:</strong> Complete your verification to start listing properties. 
            Verified landlords attract more quality tenants.
          </div>
          <p>📖 <a href="${agentGuideUrl}" style="color: #8b5cf6;">Read our Property Guide</a> for tips on successful listings.</p>
        `,
      },
    };

    const content = roleContent[role];

    const emailBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${content.headerColor}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 12px 30px; background: ${content.headerColor}; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .feature { padding: 10px 0; border-bottom: 1px solid #eee; }
            .feature:last-child { border-bottom: none; }
            a { color: ${content.headerColor}; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${content.headerText}</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>${content.intro}</p>
              
              <h3>What you can do:</h3>
              ${content.features}
              
              ${'extraNote' in content ? content.extraNote : ''}
              
              <div style="text-align: center;">
                <a href="${content.ctaUrl}" class="button">${content.ctaText}</a>
              </div>
              
              <p>If you have any questions, feel free to reach out to us:</p>
              <p>📧 Email: housemedream@gmail.com</p>
              <p>📱 WhatsApp: +234 915 208 7229</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
              <p>Finding your dream home in Nigeria.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send welcome email to: ${email}`);
      return { success: false };
    }

    const mailOptions = {
      from: `"House Me" <${fromEmail}>`,
      to: email,
      subject: content.subject,
      html: emailBody,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Welcome email (${role}) sent to: ${email} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send welcome email to ${email}:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendViewingStatusEmail(
    email: string,
    name: string,
    propertyTitle: string,
    status: 'confirmed' | 'cancelled' | 'completed',
    scheduledDate: string,
    scheduledTime: string,
    agentName?: string,
  ) {
    const fromEmail =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@houseme.com';

    const statusMessages = {
      confirmed: {
        subject: `Viewing Confirmed - ${propertyTitle}`,
        header: 'Your Viewing is Confirmed! ✅',
        message: 'Great news! Your property viewing has been confirmed.',
        color: '#16a34a',
      },
      cancelled: {
        subject: `Viewing Cancelled - ${propertyTitle}`,
        header: 'Viewing Cancelled',
        message: 'Unfortunately, your property viewing has been cancelled.',
        color: '#ef4444',
      },
      completed: {
        subject: `Viewing Completed - ${propertyTitle}`,
        header: 'Viewing Completed',
        message: 'Thank you for completing your property viewing.',
        color: '#3b82f6',
      },
    };

    const { subject, header, message, color } = statusMessages[status];

    const emailBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${color}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${header}</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>${message}</p>
              
              <div class="details">
                <h3>Viewing Details:</h3>
                <p><strong>Property:</strong> ${propertyTitle}</p>
                <p><strong>Date:</strong> ${scheduledDate}</p>
                <p><strong>Time:</strong> ${scheduledTime}</p>
                ${agentName ? `<p><strong>Agent:</strong> ${agentName}</p>` : ''}
              </div>
              
              ${status === 'confirmed' ? `
                <p>Please arrive on time for your viewing. If you need to reschedule, contact the agent directly.</p>
              ` : ''}
              
              ${status === 'cancelled' ? `
                <p>If you'd like to reschedule, please visit the property page and book a new viewing.</p>
              ` : ''}
              
              ${status === 'completed' ? `
                <p>We hope you found what you were looking for! Don't forget to leave a review for the agent.</p>
              ` : ''}
              
              <p>Need help? Contact us:</p>
              <p>📧 Email: housemedream@gmail.com</p>
              <p>📱 WhatsApp: +234 915 208 7229</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send viewing status email to: ${email}`);
      return { success: false };
    }

    const mailOptions = {
      from: `"House Me" <${fromEmail}>`,
      to: email,
      subject,
      html: emailBody,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Viewing status email sent to: ${email} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send viewing status email to ${email}:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendVerificationEmail(
    email: string,
    name: string,
    status: 'approved' | 'rejected',
    message: string,
    rejectionReason?: string,
  ) {
    const subject = status === 'approved' 
      ? 'Verification Approved - House Me' 
      : 'Verification Rejected - House Me';

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
            .status-approved { color: #10b981; font-weight: bold; }
            .status-rejected { color: #ef4444; font-weight: bold; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Verification ${status === 'approved' ? 'Approved' : 'Rejected'}</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>Your verification request has been <span class="status-${status}">${status === 'approved' ? 'APPROVED' : 'REJECTED'}</span>.</p>
              ${rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
              <p><strong>Message:</strong> ${message}</p>
              ${status === 'approved' 
                ? '<p>You can now upload properties on House Me. Thank you for your patience!</p>'
                : '<p>Please submit a new verification request with valid documents that meet our requirements.</p>'}
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
        `Email sending is disabled. Would send verification email to: ${email}`,
      );
      return { success: false };
    }

    const mailOptions = {
      from: `"House Me" <${fromEmail}>`,
      to: email,
      subject: subject,
      html: emailBody,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Verification email sent to: ${email} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send verification email to ${email}:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendSlotBookingEmail(
    tenantEmail: string,
    tenantName: string,
    agentEmail: string,
    agentName: string,
    propertyTitle: string,
    propertyLocation: string,
    slotsRemaining: number,
    totalSlots: number,
  ) {
    const fromEmail =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@houseme.com';

    const propertyUrl = `${this.frontendUrl}`;

    // Email to tenant
    const tenantEmailBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8b5cf6; }
            .button { display: inline-block; padding: 12px 30px; background: #8b5cf6; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .slots { background: #f0fdf4; padding: 15px; border-radius: 8px; text-align: center; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏠 Slot Booked Successfully!</h1>
            </div>
            <div class="content">
              <p>Hello ${tenantName},</p>
              <p>Great news! You have successfully booked a slot in a shared property.</p>
              
              <div class="details">
                <h3>Property Details:</h3>
                <p><strong>Property:</strong> ${propertyTitle}</p>
                <p><strong>Location:</strong> ${propertyLocation}</p>
                <p><strong>Agent/Landlord:</strong> ${agentName}</p>
              </div>
              
              <div class="slots">
                <strong>Slots Status:</strong> ${totalSlots - slotsRemaining}/${totalSlots} slots booked
              </div>
              
              <p><strong>What's Next?</strong></p>
              <ul>
                <li>Schedule a viewing with the agent</li>
                <li>View your co-tenants' profiles once they book</li>
                <li>Connect with potential roommates</li>
              </ul>
              
              <div style="text-align: center;">
                <a href="${propertyUrl}" class="button">View Property</a>
              </div>
              
              <p>Need help? Contact us:</p>
              <p>📧 Email: housemedream@gmail.com</p>
              <p>📱 WhatsApp: +234 915 208 7229</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
              <p>2-to-Tango Shared Living</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Email to agent/landlord
    const agentEmailBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a; }
            .button { display: inline-block; padding: 12px 30px; background: #16a34a; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .slots { background: #fef3c7; padding: 15px; border-radius: 8px; text-align: center; margin: 15px 0; }
            .alert { background: #fee2e2; padding: 15px; border-radius: 8px; text-align: center; margin: 15px 0; border: 1px solid #ef4444; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 New Slot Booking!</h1>
            </div>
            <div class="content">
              <p>Hello ${agentName},</p>
              <p>Someone has just booked a slot in your shared property!</p>
              
              <div class="details">
                <h3>Booking Details:</h3>
                <p><strong>Property:</strong> ${propertyTitle}</p>
                <p><strong>Tenant Name:</strong> ${tenantName}</p>
                <p><strong>Tenant Email:</strong> ${tenantEmail}</p>
              </div>
              
              ${slotsRemaining === 0 ? `
                <div class="alert">
                  <strong>⚠️ Property Fully Booked!</strong><br>
                  All ${totalSlots} slots have been filled.
                </div>
              ` : `
                <div class="slots">
                  <strong>Remaining Slots:</strong> ${slotsRemaining} of ${totalSlots}
                </div>
              `}
              
              <p>You can now contact the tenant to schedule a viewing or discuss next steps.</p>
              
              <div style="text-align: center;">
                <a href="${this.frontendUrl}/dashboard" class="button">Go to Dashboard</a>
              </div>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const results: { tenant?: any; agent?: any } = {};

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send slot booking emails`);
      return { success: false };
    }

    // Send to tenant
    try {
      const tenantInfo = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: tenantEmail,
        subject: `✅ Slot Booked - ${propertyTitle}`,
        html: tenantEmailBody,
      });
      this.logger.log(`Slot booking email sent to tenant: ${tenantEmail}`);
      results.tenant = { success: true, messageId: tenantInfo.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send slot booking email to tenant:`, error);
      results.tenant = { success: false, error: error.message };
    }

    // Send to agent/landlord
    try {
      const agentInfo = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: agentEmail,
        subject: `🎉 New Slot Booking - ${propertyTitle}`,
        html: agentEmailBody,
      });
      this.logger.log(`Slot booking email sent to agent: ${agentEmail}`);
      results.agent = { success: true, messageId: agentInfo.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send slot booking email to agent:`, error);
      results.agent = { success: false, error: error.message };
    }

    return results;
  }

  async sendViewingScheduledEmail(
    userEmail: string,
    userName: string,
    agentEmail: string,
    agentName: string,
    propertyTitle: string,
    propertyLocation: string,
    scheduledDate: string,
    scheduledTime: string,
  ) {
    const fromEmail =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@houseme.com';

    // Email to user who scheduled viewing
    const userEmailBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📅 Viewing Request Submitted!</h1>
            </div>
            <div class="content">
              <p>Hello ${userName},</p>
              <p>Your viewing request has been submitted successfully. The agent will review and confirm shortly.</p>
              
              <div class="details">
                <h3>Viewing Details:</h3>
                <p><strong>Property:</strong> ${propertyTitle}</p>
                <p><strong>Location:</strong> ${propertyLocation}</p>
                <p><strong>Date:</strong> ${scheduledDate}</p>
                <p><strong>Time:</strong> ${scheduledTime}</p>
                <p><strong>Agent:</strong> ${agentName}</p>
              </div>
              
              <p>You will receive another email once the agent confirms your viewing.</p>
              
              <p>Need help? Contact us:</p>
              <p>📧 Email: housemedream@gmail.com</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Email to agent
    const agentEmailBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a; }
            .button { display: inline-block; padding: 12px 30px; background: #16a34a; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📅 New Viewing Request!</h1>
            </div>
            <div class="content">
              <p>Hello ${agentName},</p>
              <p>You have received a new property viewing request!</p>
              
              <div class="details">
                <h3>Request Details:</h3>
                <p><strong>Property:</strong> ${propertyTitle}</p>
                <p><strong>Location:</strong> ${propertyLocation}</p>
                <p><strong>Requested Date:</strong> ${scheduledDate}</p>
                <p><strong>Requested Time:</strong> ${scheduledTime}</p>
                <p><strong>Client Name:</strong> ${userName}</p>
                <p><strong>Client Email:</strong> ${userEmail}</p>
              </div>
              
              <p>Please log in to your dashboard to confirm or reschedule this viewing.</p>
              
              <div style="text-align: center;">
                <a href="${this.frontendUrl}/dashboard" class="button">Go to Dashboard</a>
              </div>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const results: { user?: any; agent?: any } = {};

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send viewing scheduled emails`);
      return { success: false };
    }

    // Send to user
    try {
      const userInfo = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: userEmail,
        subject: `📅 Viewing Request Submitted - ${propertyTitle}`,
        html: userEmailBody,
      });
      this.logger.log(`Viewing scheduled email sent to user: ${userEmail}`);
      results.user = { success: true, messageId: userInfo.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send viewing scheduled email to user:`, error);
      results.user = { success: false, error: error.message };
    }

    // Send to agent
    try {
      const agentInfo = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: agentEmail,
        subject: `📅 New Viewing Request - ${propertyTitle}`,
        html: agentEmailBody,
      });
      this.logger.log(`Viewing scheduled email sent to agent: ${agentEmail}`);
      results.agent = { success: true, messageId: agentInfo.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send viewing scheduled email to agent:`, error);
      results.agent = { success: false, error: error.message };
    }

    return results;
  }

  async sendCoTenantNotificationEmail(
    existingTenantEmail: string,
    existingTenantName: string,
    newTenantName: string,
    propertyTitle: string,
    propertyLocation: string,
    slotsRemaining: number,
    totalSlots: number,
  ) {
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
            .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8b5cf6; }
            .button { display: inline-block; padding: 12px 30px; background: #8b5cf6; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .slots { background: #f0fdf4; padding: 15px; border-radius: 8px; text-align: center; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>👋 New Co-Tenant Alert!</h1>
            </div>
            <div class="content">
              <p>Hello ${existingTenantName},</p>
              <p>Good news! Someone new has booked a slot in your shared property.</p>
              
              <div class="details">
                <h3>Property Details:</h3>
                <p><strong>Property:</strong> ${propertyTitle}</p>
                <p><strong>Location:</strong> ${propertyLocation}</p>
                <p><strong>New Co-Tenant:</strong> ${newTenantName}</p>
              </div>
              
              <div class="slots">
                <strong>Slots Status:</strong> ${totalSlots - slotsRemaining}/${totalSlots} slots booked
              </div>
              
              <p>You can now view their profile and connect with them through the property page.</p>
              
              <div style="text-align: center;">
                <a href="${this.frontendUrl}" class="button">View Co-Tenants</a>
              </div>
              
              <p>Need help? Contact us:</p>
              <p>📧 Email: housemedream@gmail.com</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
              <p>2-to-Tango Shared Living</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send co-tenant notification to: ${existingTenantEmail}`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: existingTenantEmail,
        subject: `👋 New Co-Tenant - ${propertyTitle}`,
        html: emailBody,
      });
      this.logger.log(`Co-tenant notification sent to: ${existingTenantEmail}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send co-tenant notification:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendTransactionPinResetEmail(email: string, resetCode: string, name?: string) {
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
            .code-box { background: #fff; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
            .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Transaction PIN Reset Code</h1>
            </div>
            <div class="content">
              <p>Hello ${name || 'there'},</p>
              <p>You requested to reset your transaction PIN. Use the code below to reset it:</p>
              <div class="code-box">
                <div class="code">${resetCode}</div>
              </div>
              <p>This code will expire in 15 minutes.</p>
              <p>If you didn't request this reset, please ignore this email and contact support if you have concerns.</p>
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
        `Email sending is disabled. Would send transaction PIN reset email to: ${email} with code: ${resetCode}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: fromEmail,
        to: email,
        subject: 'Transaction PIN Reset Code',
        html: emailBody,
      });
      this.logger.log(`Transaction PIN reset email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send transaction PIN reset email to ${email}:`, error);
      throw error;
    }
  }

  async sendVerificationReminderEmail(email: string, name: string, customMessage?: string) {
    const fromEmail =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@houseme.com';

    const dashboardUrl = `${this.frontendUrl}/dashboard`;

    const emailBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .alert { background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
            .button { display: inline-block; padding: 12px 30px; background: #f59e0b; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .benefits { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Complete Your Verification</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              
              ${customMessage ? `<div class="alert"><p><strong>${customMessage}</strong></p></div>` : ''}
              
              <div class="alert">
                <p><strong>Your account is not yet verified!</strong></p>
                <p>To start listing properties on House Me, you need to complete the verification process.</p>
              </div>
              
              <div class="benefits">
                <h3>Benefits of Verification:</h3>
                <ul>
                  <li>✅ List unlimited properties</li>
                  <li>✅ Verified badge on your profile</li>
                  <li>✅ Higher visibility in search results</li>
                  <li>✅ Increased trust from potential clients</li>
                  <li>✅ Access to premium features</li>
                </ul>
              </div>
              
              <p>The verification process is simple:</p>
              <ol>
                <li>Log in to your dashboard</li>
                <li>Upload a valid ID (NIN or Driver's License)</li>
                <li>Take a selfie for verification</li>
                <li>Wait for admin approval (usually within 24 hours)</li>
              </ol>
              
              <div style="text-align: center;">
                <a href="${dashboardUrl}" class="button">Complete Verification Now</a>
              </div>
              
              <p>Need help? Contact us:</p>
              <p>📧 Email: housemedream@gmail.com</p>
              <p>📱 WhatsApp: +234 915 208 7229</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send verification reminder to: ${email}`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: `⚠️ Complete Your Verification - House Me`,
        html: emailBody,
      });
      this.logger.log(`Verification reminder sent to: ${email}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send verification reminder:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendAgentSuspensionEmail(email: string, name: string, reason?: string) {
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
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .alert { background: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Account Suspended</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              
              <div class="alert">
                <p><strong>Your account has been suspended.</strong></p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              </div>
              
              <p>During this suspension period, your properties will not be visible to users.</p>
              
              <p>If you believe this is an error or have questions, please contact us:</p>
              <p>📧 Email: housemedream@gmail.com</p>
              <p>📱 WhatsApp: +234 915 208 7229</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send suspension email to: ${email}`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: `⚠️ Account Suspended - House Me`,
        html: emailBody,
      });
      this.logger.log(`Suspension email sent to: ${email}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send suspension email:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendAgentBanEmail(email: string, name: string, reason?: string) {
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
            .header { background: linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .alert { background: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #991b1b; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚫 Account Banned</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              
              <div class="alert">
                <p><strong>Your account has been permanently banned.</strong></p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              </div>
              
              <p>All your properties have been delisted and will no longer be visible to users.</p>
              
              <p>If you believe this is an error, please contact us:</p>
              <p>📧 Email: housemedream@gmail.com</p>
              <p>📱 WhatsApp: +234 915 208 7229</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send ban email to: ${email}`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: `🚫 Account Banned - House Me`,
        html: emailBody,
      });
      this.logger.log(`Ban email sent to: ${email}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send ban email:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendAgentActivationEmail(email: string, name: string, reason?: string) {
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
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .alert { background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Account Reactivated</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              
              <div class="alert">
                <p><strong>Your account has been reactivated!</strong></p>
                ${reason ? `<p><strong>Note:</strong> ${reason}</p>` : ''}
              </div>
              
              <p>You can now access your account and your properties are visible to users again.</p>
              
              <p>If you have any questions, please contact us:</p>
              <p>📧 Email: housemedream@gmail.com</p>
              <p>📱 WhatsApp: +234 915 208 7229</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send activation email to: ${email}`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: `✅ Account Reactivated - House Me`,
        html: emailBody,
      });
      this.logger.log(`Activation email sent to: ${email}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send activation email:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendAgentDeletionEmail(email: string, name: string, reason?: string) {
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
            .header { background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .alert { background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6b7280; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Account Deleted</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              
              <div class="alert">
                <p><strong>Your account has been permanently deleted.</strong></p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              </div>
              
              <p>All your properties have been removed from the platform.</p>
              
              <p>If you believe this is an error, please contact us:</p>
              <p>📧 Email: housemedream@gmail.com</p>
              <p>📱 WhatsApp: +234 915 208 7229</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send deletion email to: ${email}`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: `Account Deleted - House Me`,
        html: emailBody,
      });
      this.logger.log(`Deletion email sent to: ${email}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send deletion email:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendPropertiesDelistedEmail(email: string, name: string, reason?: string) {
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
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .alert { background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Properties Delisted</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              
              <div class="alert">
                <p><strong>All your properties have been delisted from the platform.</strong></p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
              </div>
              
              <p>Your properties are no longer visible to users. If you have questions or concerns, please contact us.</p>
              
              <p>📧 Email: housemedream@gmail.com</p>
              <p>📱 WhatsApp: +234 915 208 7229</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send delist email to: ${email}`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: `⚠️ Properties Delisted - House Me`,
        html: emailBody,
      });
      this.logger.log(`Delist email sent to: ${email}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send delist email:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendViewingPaymentConfirmationEmail(
    email: string,
    name: string,
    amount: number,
    propertyTitle: string,
    scheduledDate: string,
    scheduledTime: string,
  ) {
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
            .info-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Payment Confirmed</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>Your payment for the property viewing has been successfully processed!</p>
              <div class="info-box">
                <p><strong>Property:</strong> ${propertyTitle}</p>
                <p><strong>Amount Paid:</strong> ₦${amount.toLocaleString()}</p>
                <p><strong>Scheduled Date:</strong> ${new Date(scheduledDate).toLocaleDateString()}</p>
                <p><strong>Scheduled Time:</strong> ${scheduledTime}</p>
              </div>
              <p>Your viewing appointment is confirmed. We look forward to seeing you!</p>
              <p>If you have any questions, please don't hesitate to contact us.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send payment confirmation to: ${email}`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: '✅ Viewing Payment Confirmed - House Me',
        html: emailBody,
      });
      this.logger.log(`Payment confirmation email sent to: ${email}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send payment confirmation email:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendViewingPaymentReceivedEmail(
    email: string,
    name: string,
    totalAmount: number,
    agentAmount: number,
    platformFee: number,
    propertyTitle: string,
    userName: string,
  ) {
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
            .info-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💰 Payment Received</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>Great news! You've received a payment for a property viewing.</p>
              <div class="info-box">
                <p><strong>Property:</strong> ${propertyTitle}</p>
                <p><strong>Viewer:</strong> ${userName}</p>
                <p><strong>Total Amount:</strong> ₦${totalAmount.toLocaleString()}</p>
                <p><strong>Your Earnings:</strong> ₦${agentAmount.toLocaleString()}</p>
                <p><strong>Platform Fee:</strong> ₦${platformFee.toLocaleString()}</p>
              </div>
              <p>The amount has been added to your wallet balance and is available for withdrawal.</p>
              <p>Thank you for using House Me!</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send payment received email to: ${email}`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: '💰 Viewing Payment Received - House Me',
        html: emailBody,
      });
      this.logger.log(`Payment received email sent to: ${email}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send payment received email:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendPromotionPaymentConfirmationEmail(
    email: string,
    name: string,
    amount: number,
    propertyTitle: string,
    days: number,
    startDate: string,
    endDate: string,
  ) {
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
            .info-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Promotion Payment Confirmed</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>Your payment for property promotion has been successfully processed!</p>
              <div class="info-box">
                <p><strong>Property:</strong> ${propertyTitle}</p>
                <p><strong>Amount Paid:</strong> ₦${amount.toLocaleString()}</p>
                <p><strong>Promotion Duration:</strong> ${days} day(s)</p>
                <p><strong>Start Date:</strong> ${new Date(startDate).toLocaleDateString()}</p>
                <p><strong>End Date:</strong> ${new Date(endDate).toLocaleDateString()}</p>
              </div>
              <p>Your property is now being promoted and will appear in featured listings!</p>
              <p>Thank you for using House Me!</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send promotion payment confirmation to: ${email}`);
      return { success: false };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: '✅ Promotion Payment Confirmed - House Me',
        html: emailBody,
      });
      this.logger.log(`Promotion payment confirmation email sent to: ${email}`);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send promotion payment confirmation email:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendWithdrawalOtpEmail(email: string, otp: string, name?: string) {
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
            .code-box { background: #fff; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px; }
            .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .warning { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Withdrawal OTP</h1>
            </div>
            <div class="content">
              <p>Hello ${name || 'there'},</p>
              <p>You requested to withdraw funds from your wallet. Use the OTP below to complete your withdrawal:</p>
              <div class="code-box">
                <div class="code">${otp}</div>
              </div>
              <div class="warning">
                <strong>⚠️ Important:</strong> This OTP will expire in 1 minute and 50 seconds. Do not share this code with anyone.
              </div>
              <p>If you didn't request this withdrawal, please ignore this email and contact support immediately.</p>
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
        `Email sending is disabled. Would send withdrawal OTP to: ${email} with code: ${otp}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: fromEmail,
        to: email,
        subject: 'Withdrawal OTP - House Me',
        html: emailBody,
      });
      this.logger.log(`Withdrawal OTP email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send withdrawal OTP email to ${email}:`, error);
      throw error;
    }
  }

  async sendWithdrawalProcessingEmail(email: string, name: string, amount: number, bankName: string, accountNumber: string) {
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
            .header { background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Withdrawal Processing</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>Your withdrawal request for <strong>₦${amount.toLocaleString()}</strong> is being processed.</p>
              <div class="info-box">
                <p><strong>Bank:</strong> ${bankName}</p>
                <p><strong>Account:</strong> ****${accountNumber.slice(-4)}</p>
              </div>
              <p>We will notify you once the transfer has been completed.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send withdrawal processing email to: ${email}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: 'Withdrawal Processing - House Me',
        html: emailBody,
      });
      this.logger.log(`Withdrawal processing email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send withdrawal processing email to ${email}:`, error);
    }
  }

  async sendWithdrawalSuccessEmail(email: string, name: string, amount: number, bankName: string, accountNumber: string) {
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
            .header { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #16a34a; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Withdrawal Successful</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>Great news! Your withdrawal has been successfully processed.</p>
              <div class="info-box">
                <p><strong>Amount:</strong> ₦${amount.toLocaleString()}</p>
                <p><strong>Bank:</strong> ${bankName}</p>
                <p><strong>Account:</strong> ****${accountNumber.slice(-4)}</p>
              </div>
              <p>The funds should reflect in your account shortly.</p>
              <p>Thank you for using House Me!</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send withdrawal success email to: ${email}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: '✅ Withdrawal Successful - House Me',
        html: emailBody,
      });
      this.logger.log(`Withdrawal success email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send withdrawal success email to ${email}:`, error);
    }
  }

  async sendWithdrawalFailedEmail(email: string, name: string, amount: number, reason: string) {
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
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .info-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ef4444; }
            .refund-note { background: #dcfce7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>❌ Withdrawal Failed</h1>
            </div>
            <div class="content">
              <p>Hello ${name},</p>
              <p>Unfortunately, your withdrawal request could not be processed.</p>
              <div class="info-box">
                <p><strong>Amount:</strong> ₦${amount.toLocaleString()}</p>
                <p><strong>Reason:</strong> ${reason}</p>
              </div>
              <div class="refund-note">
                <p><strong>💰 Refund:</strong> The amount has been refunded to your wallet balance.</p>
              </div>
              <p>Please verify your bank details and try again, or contact support if the issue persists.</p>
              <p>📧 Email: housemedream@gmail.com</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} House Me. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    if (!this.transporter) {
      this.logger.warn(`Email sending is disabled. Would send withdrawal failed email to: ${email}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"House Me" <${fromEmail}>`,
        to: email,
        subject: '❌ Withdrawal Failed - House Me',
        html: emailBody,
      });
      this.logger.log(`Withdrawal failed email sent to: ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send withdrawal failed email to ${email}:`, error);
    }
  }
}

