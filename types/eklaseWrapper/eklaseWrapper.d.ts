namespace EklaseTypes {
	interface RecentGrade{
		lesson: string,
		grade: string,
		date: string
	}
	
	interface Attachment{
		text: string,
		url: string
	}
	
	interface Homework{
		info?: string,
		link?: Attachment,
		author: string,
		time: string,
		date: string,
		modifyDate?: string,
		modifyTime?: string
	}
	
	interface Lesson{
		index: string,
		lesson: string,
		classroom: string,
		homework: Homework[],
		theme?: string,
		grade?: string
	}
	
	interface LessonDay{
		lessons: Lesson[],
		date: string
	}
	
	interface MailContent{
		attachements: string[],
		authorId: number,
		authorName: string,
		body: string,
		draftRecipients?: number[],
		draftType?: any, // I have no idea what this property is
		followUpStatus: string,
		id: number,
		previousMessageId?: number,
		recipientsData: {
			hideRecipients: boolean,
			loadRecipientsSeparately: boolean,
			recipients: number[]
		},
		status: string,
		subject: string,
		timeCreated: Date
	}
	
	interface Mail{
		ids: number[],
		content: MailContent[]
	}
	
	interface ScrapeBuffer{
		recentGrades: RecentGrade[],
		homework: LessonDay[],
		mail: Mail
	}
}
