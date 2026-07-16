const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify()
  .then(() => console.log('Email service ready'))
  .catch((err) => console.error('Email service error:', err.message));

const sendNewUserWelcomeEmail = async ({
  to,
  tempPassword,
  loginUrl,
  role,
  adminEmail,
}) => {
  const subject = 'Your QC account has been created';

  const text = `
You have been added to the QC Checker platform.

Assigned role: ${role}
Login email: ${to}
Temporary password: ${tempPassword}
Login link: ${loginUrl}
Reply to: ${adminEmail}

You will be asked to change your password when you log in for the first time.
  `.trim();

  const html = `
    <p>You have been added to the <strong>QC Checker</strong> platform.</p>
    <p><strong>Assigned role:</strong> ${role}</p>
    <p><strong>Login email:</strong> ${to}</p>
    <p><strong>Temporary password:</strong> ${tempPassword}</p>
    <p><strong>Login link:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
    <p><strong>Reply to:</strong> ${adminEmail}</p>
    <p>You will be asked to change your password when you log in for the first time.</p>
  `;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    replyTo: adminEmail,
    to,
    subject,
    text,
    html,
  });
};

const sendPasswordResetEmail = async ({
  to,
  tempPassword,
  loginUrl,
  adminEmail,
}) => {
  const subject = 'Your QC Checker password has been reset';

  const text = `
Your QC Checker password has been reset.

Login email: ${to}
Temporary password: ${tempPassword}
Login link: ${loginUrl}
Reply to: ${adminEmail}

You will be asked to change your password when you log in.
  `.trim();

  const html = `
    <p>Your <strong>QC Checker</strong> password has been reset.</p>
    <p><strong>Login email:</strong> ${to}</p>
    <p><strong>Temporary password:</strong> ${tempPassword}</p>
    <p><strong>Login link:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
    <p><strong>Reply to:</strong> ${adminEmail}</p>
    <p>You will be asked to change your password when you log in.</p>
  `;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    replyTo: adminEmail,
    to,
    subject,
    text,
    html,
  });
};

const sendTeamAssignmentEmail = async ({
  to,
  teamName,
  role,
  loginUrl,
}) => {
  const roleLabel = role === 'team_leader' ? 'Team Leader' : 'Member';
  const subject = `You have been assigned to team "${teamName}"`;

  const text = `
You have been assigned to a team on the QC Checker platform.

Team: ${teamName}
Your role: ${roleLabel}
Login link: ${loginUrl}
  `.trim();

  const html = `
    <p>You have been assigned to a team on the <strong>QC Checker</strong> platform.</p>
    <p><strong>Team:</strong> ${teamName}</p>
    <p><strong>Your role:</strong> ${roleLabel}</p>
    <p><strong>Login link:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
  `;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
};

const sendTeamLeadAssignmentEmail = async ({ to, teamName, loginUrl }) => {
  const subject = `You have been assigned as Team Leader for "${teamName}"`;

  const text = `
You have been assigned as the Team Leader for the team "${teamName}" on the QC Checker platform.

As a Team Leader, you can manage your team members, view team reports and monitor your team's performance.

Login link: ${loginUrl}
  `.trim();

  const html = `
    <p>You have been assigned as the <strong>Team Leader</strong> for the team <strong>"${teamName}"</strong> on the <strong>QC Checker</strong> platform.</p>
    <p>As a Team Leader, you can manage your team members, view team reports and monitor your team's performance.</p>
    <p><strong>Login link:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
  `;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
};

const sendTeamRemovalEmail = async ({ to, teamName }) => {
  const subject = `You have been removed from team "${teamName}"`;

  const text = `
You have been removed from the team "${teamName}" on the QC Checker platform.

If you believe this was a mistake, please contact your administrator.
  `.trim();

  const html = `
    <p>You have been removed from the team <strong>"${teamName}"</strong> on the <strong>QC Checker</strong> platform.</p>
    <p>If you believe this was a mistake, please contact your administrator.</p>
  `;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
};

module.exports = {
  sendNewUserWelcomeEmail,
  sendPasswordResetEmail,
  sendTeamAssignmentEmail,
  sendTeamLeadAssignmentEmail,
  sendTeamRemovalEmail,
};
