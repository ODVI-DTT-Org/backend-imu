/**
 * Email Service - Configurable email provider
 * Supports: Resend, SendGrid, Console (dev), Mock
 */
import crypto from 'crypto';
// Email templates
const templates = {
    passwordReset: (resetUrl, userName) => ({
        subject: 'IMU - Password Reset Request',
        html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1e40af; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 24px; background: #1e40af; color: white; text-decoration: none; border-radius: 6px; }
          .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>IMU Password Reset</h1>
          </div>
          <div class="content">
            <p>Hello ${userName},</p>
            <p>You requested to reset your password. Click the button below to proceed:</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy this link to your browser:</p>
            <p style="word-break: break-all; color: #1e40af;">${resetUrl}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} IMU - Itinerary Manager Uniformed</p>
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
        text: `Hello ${userName},\n\nYou requested to reset your password.\n\nClick this link to reset: ${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`
    }),
    welcome: (userName, loginUrl) => ({
        subject: 'Welcome to IMU',
        html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1e40af; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 24px; background: #1e40af; color: white; text-decoration: none; border-radius: 6px; }
          .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to IMU</h1>
          </div>
          <div class="content">
            <p>Hello ${userName},</p>
            <p>Your account has been created successfully. You can now access the IMU system.</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" class="button">Login to IMU</a>
            </p>
            <p>If you have any questions, please contact your administrator.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} IMU - Itinerary Manager Uniformed</p>
          </div>
        </div>
      </body>
      </html>
    `,
        text: `Hello ${userName},\n\nYour account has been created successfully.\n\nLogin at: ${loginUrl}\n\nIf you have any questions, please contact your administrator.`
    }),
    approvalRequest: (approverName, requesterName, approvalType, clientName, approvalUrl) => ({
        subject: `IMU - ${approvalType.toUpperCase()} Approval Request`,
        html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1e40af; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 24px; background: #1e40af; color: white; text-decoration: none; border-radius: 6px; }
          .info-box { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Approval Request</h1>
          </div>
          <div class="content">
            <p>Hello ${approverName},</p>
            <p>${requesterName} has submitted an approval request that requires your review.</p>
            <div class="info-box">
              <p><strong>Type:</strong> ${approvalType.toUpperCase()}</p>
              <p><strong>Client:</strong> ${clientName}</p>
            </div>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${approvalUrl}" class="button">Review & Decide</a>
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} IMU - Itinerary Manager Uniformed</p>
          </div>
        </div>
      </body>
      </html>
    `,
        text: `Hello ${approverName},\n\n${requesterName} has submitted a ${approvalType} approval request for client ${clientName}.\n\nReview at: ${approvalUrl}`
    }),
    approvalResult: (userName, approvalType, clientName, status, reason) => ({
        subject: `IMU - Approval ${status.toUpperCase()}`,
        html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${status === 'approved' ? '#059669' : '#dc2626'}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .info-box { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Approval ${status === 'approved' ? 'Approved' : 'Rejected'}</h1>
          </div>
          <div class="content">
            <p>Hello ${userName},</p>
            <p>Your ${approvalType} approval request has been <strong>${status}</strong>.</p>
            <div class="info-box">
              <p><strong>Type:</strong> ${approvalType.toUpperCase()}</p>
              <p><strong>Client:</strong> ${clientName}</p>
              <p><strong>Status:</strong> ${status}</p>
              ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            </div>
            ${status === 'rejected' ? '<p>Please address the feedback and resubmit if necessary.</p>' : '<p>You can now proceed with the next steps.</p>'}
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} IMU - Itinerary Manager Uniformed</p>
          </div>
        </div>
      </body>
      </html>
    `,
        text: `Hello ${userName},\n\nYour ${approvalType} approval request has been ${status}.\n\nClient: ${clientName}\nStatus: ${status}${reason ? `\nReason: ${reason}` : ''}`
    })
};
class EmailService {
    provider;
    from;
    constructor() {
        this.provider = process.env.EMAIL_PROVIDER || 'console';
        this.from = process.env.EMAIL_FROM || 'IMU <noreply@imu.app>';
    }
    async send(options) {
        const { to, subject, html, text, from = this.from } = options;
        switch (this.provider) {
            case 'resend':
                return this.sendViaResend(to, subject, html, text, from);
            case 'sendgrid':
                return this.sendViaSendGrid(to, subject, html, text, from);
            case 'mock':
                return this.mockSend(to, subject, html);
            case 'console':
            default:
                return this.consoleSend(to, subject, html);
        }
    }
    async sendViaResend(to, subject, html, text, from) {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from,
                    to: Array.isArray(to) ? to : [to],
                    subject,
                    html,
                    text,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                return { success: false, error: data.message || 'Failed to send email' };
            }
            return { success: true, messageId: data.id };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async sendViaSendGrid(to, subject, html, text, from) {
        try {
            const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    personalizations: [{
                            to: (Array.isArray(to) ? to : [to]).map(email => ({ email })),
                        }],
                    from: { email: from?.replace(/.*<(.*)>.*/, '$1') || 'noreply@imu.app' },
                    subject,
                    content: [
                        { type: 'text/html', value: html },
                        ...(text ? [{ type: 'text/plain', value: text }] : []),
                    ],
                }),
            });
            if (!response.ok) {
                const data = await response.json();
                return { success: false, error: data.errors?.[0]?.message || 'Failed to send email' };
            }
            return { success: true, messageId: response.headers.get('X-Message-Id') || undefined };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    consoleSend(to, subject, html) {
        console.log('\n========== EMAIL ==========');
        console.log(`From: ${this.from}`);
        console.log(`To: ${Array.isArray(to) ? to.join(', ') : to}`);
        console.log(`Subject: ${subject}`);
        console.log('----------------------------');
        console.log(html.replace(/<[^>]*>/g, '').substring(0, 500));
        console.log('========== END EMAIL ==========\n');
        return { success: true, messageId: `console-${Date.now()}` };
    }
    mockSend(to, subject, html) {
        // For testing - returns success without doing anything
        return { success: true, messageId: `mock-${crypto.randomUUID()}` };
    }
    // Template helpers
    async sendPasswordReset(email, resetUrl, userName) {
        const template = templates.passwordReset(resetUrl, userName);
        return this.send({
            to: email,
            subject: template.subject,
            html: template.html,
            text: template.text,
        });
    }
    async sendWelcome(email, userName, loginUrl) {
        const template = templates.welcome(userName, loginUrl);
        return this.send({
            to: email,
            subject: template.subject,
            html: template.html,
            text: template.text,
        });
    }
    async sendApprovalRequest(approverEmail, approverName, requesterName, approvalType, clientName, approvalUrl) {
        const template = templates.approvalRequest(approverName, requesterName, approvalType, clientName, approvalUrl);
        return this.send({
            to: approverEmail,
            subject: template.subject,
            html: template.html,
            text: template.text,
        });
    }
    async sendApprovalResult(userEmail, userName, approvalType, clientName, status, reason) {
        const template = templates.approvalResult(userName, approvalType, clientName, status, reason);
        return this.send({
            to: userEmail,
            subject: template.subject,
            html: template.html,
            text: template.text,
        });
    }
}
// Export singleton instance
export const emailService = new EmailService();
export { templates };
