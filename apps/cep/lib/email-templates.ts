
export type EmailType =
  | 'welcome'
  | 'followus'
  | 'followus_reminder'
  | 'review'
  | 'referral'
  | 'birthday'
  | 'video';

export interface TemplateData {
  parentName: string;
  studentName: string;
  branch?: string;
  videoLink?: string;
  monthNumber?: number;
  referralCode?: string;
}

export interface EmailContent {
  subject: string;
  text: string;
}

export function getEmailTemplate(type: EmailType, data: TemplateData): EmailContent {
  const {
    parentName,
    studentName,
    videoLink,
    monthNumber = 1,
    referralCode = 'EB-REF-JUN25',
  } = data;

  switch (type) {
    case 'welcome':
      return {
        subject: `Welcome to Ebright Academy, ${studentName}! 🎉`,
        text: `Welcome to Ebright Academy, ${parentName}! 🎉

We can't wait to meet ${studentName} soon! Classes start shortly. See you there!

— Team Ebright Academy`,
      };

    case 'followus':
      return {
        subject: `Follow Ebright Academy on Instagram & TikTok 📱`,
        text: `Hi ${parentName}! 👋

Thanks for enrolling ${studentName} with us!

Don't forget to follow us on Instagram & TikTok @ebrightacademy for daily confident-speaking tips 📱✨

— Team Ebright Academy`,
      };

    case 'followus_reminder':
      return {
        subject: `2 weeks with Ebright! Don't miss our tips 📱`,
        text: `Hi ${parentName}! 👋

It's been 2 weeks with Ebright — thank you for trusting us!

Don't forget to follow us on Instagram & TikTok @ebrightacademy for daily confident-speaking tips 📱✨

${studentName} is sure to grow more confident and shine!

— Team Ebright Academy`,
      };

    case 'review':
      return {
        subject: `${studentName} has been with Ebright for 6 weeks! ⭐`,
        text: `${parentName},

6 weeks have passed — ${studentName} is growing wonderfully! 💪

⭐ "My child became confident speaking in front of class within a month!" — Mrs. Rohani, Shah Alam

Many great kids started just like ${studentName}. Thank you for your trust! 🙏

— Team Ebright Academy`,
      };

    case 'referral':
      return {
        subject: `8 weeks with Ebright — invite a friend, get a FREE class! 🎁`,
        text: `${parentName}! 🎉

It's been 8 weeks with Ebright — ${studentName} has grown so much!

Invite a friend or neighbour to try our program — use code ${referralCode} for a FREE CLASS 🎁

Info & sign-up: wa.me/60112345678

Thank you for being part of the Ebright family! ❤️

— Team Ebright Academy`,
      };

    case 'birthday':
      return {
        subject: `Happy birthday, ${studentName}! 🎂`,
        text: `${parentName},

Happy birthday, ${studentName}! 🎂🎉

May you stay confident and keep shining! We love you, ${studentName} ❤️

— Team Ebright Academy 🌟`,
      };

    case 'video':
      return {
        subject: `This week's tip for ${studentName} — Month ${monthNumber} 🎥`,
        text: `Hi ${parentName}! 👋

🎥 This week's tip for ${studentName}:

Watch now 👉 ${videoLink || 'youtu.be/ebright-m' + monthNumber}

Hope this helps!

— Team Ebright Academy`,
      };
  }
}
