import puppeteer from "puppeteer";

function addDays(date: Date, days: number){
	return new Date(date.valueOf() + days * 24 * 3600 * 1000);
}

function compareRecentGrades(a: EklaseTypes.RecentGrade, b: EklaseTypes.RecentGrade): boolean{
	if(a?.lesson !== b?.lesson) return false;
	if(a?.date !== b?.date) return false;
	if(a?.grade !== b?.grade) return false;

	return true;
}

function sleep(time: number): Promise<void>{
	return new Promise<void>((res, rej) => {
		setTimeout(() => {
			res();
		}, time);
	});
}

export class EklaseWrapper{
	url = {
		base: "https://www.e-klase.lv/",
		login: "https://my.e-klase.lv?v=15",
		grades: "https://my.e-klase.lv/Family/Home",
		week: "https://my.e-klase.lv/Family/Diary",
		mailContent: "https://my.e-klase.lv/api/family/mail/messages",
		mailIDs: "https://my.e-klase.lv/api/family/mail/folder-message-ids/standardType_fmft_inbox"
	};
	
	error = {
		noBrowser: "Unable to fulfill request because the browser hasn't been launched!"
	};

	browser?: puppeteer.Browser;
	page?: puppeteer.Page;
	user: string = "";
	pass: string = "";
	debug: boolean = false;

	buffer: EklaseTypes.ScrapeBuffer;

	constructor(username: string, pass: string, debug = false){
		this.user = username;
		this.pass = pass;
		this.debug = debug;

		this.buffer = {
			recentGrades: [],
			homework: [],
			mail: {
				ids: [],
				content: []
			}
		};
	}

	launch(): Promise<puppeteer.Page>{
		return new Promise(async (res, rej) => {
			this.browser = await puppeteer.launch({headless: !this.debug});
			this.page = await this.browser.newPage();

			await this.page.goto(this.url.base);
			await sleep(500); // for some reason it breaks without a tiny bit of delay

			res(this.page);
		});
	}

	authenticate(): Promise<number>{
		return new Promise(async (resolve) => {
			if(!this.page){
				throw this.error.noBrowser;
			}

			await this.page.setRequestInterception(true);

			this.page.once("request", interceptedRequest => {
				interceptedRequest.continue({
					method: "POST",
					postData: `fake_pass=&UserName=${this.user}&Password=${this.pass}`,
					headers: {
						...interceptedRequest.headers(),
						"Content-type": "application/x-www-form-urlencoded"
					}
				});

				this.page?.setRequestInterception(false);
			});

			const resp = await this.page.goto(this.url.login);
			await sleep(500); 

			if(resp){
				resolve(resp.status());
			}
			else{
				resolve(0);
			}
		});
	}

	scrapeRecentGrades(updateBuffer = true): Promise<EklaseTypes.RecentGrade[]>{
		return new Promise(async (resolve) => {
			if(!this.page){
				throw this.error.noBrowser;
			}

			await this.page.goto(this.url.grades);

			const data = await this.page.evaluate(() => {
				const container = document.querySelector(".recent-scores-items");
				if(!container) return [];

				const gradeData: EklaseTypes.RecentGrade[] = [];

				for(const el of Array.from(container.children)){
					const cols = el.children;
					const data: EklaseTypes.RecentGrade = { lesson: "", date: "", grade: "" };

					if(cols[0].children[0].textContent) data.lesson = cols[0].children[0].textContent;
					if(cols[1].children[1].textContent) data.date = cols[1].children[1].textContent;
					if(cols[2].children[0].textContent) data.grade = cols[2].children[0].textContent.replace(/\n/g, "").trim();

					gradeData.push(data);
				}

				return gradeData;
			});

			if(updateBuffer) this.buffer.recentGrades = data;

			resolve(data);
		});
	}

	scrapeWeek(date: Date, updateBuffer = true): Promise<EklaseTypes.LessonDay[]>{ // date - a date object with a day during the desired week
		return new Promise(async (res, rej) => {
			if(!this.page){
				throw this.error.noBrowser;
			}

			await this.page.goto(`${this.url.week}?Date=${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`);

			const dateOffset = date.getDay() === 0 ? 7 : date.getDay(); // all my homies hate sunday as 0
			let curDate = addDays(date, -(dateOffset - 1));

			const data = await this.page.evaluate((curDate: number) => {
				const container = document.querySelector(".student-journal-lessons-table-holder");
				const weekData: EklaseTypes.LessonDay[] = [];

				if(!container){
					return weekData;
				}

				let iterDate = new Date(curDate);

				for(const day of Array.from(container.querySelectorAll(".lessons-table tbody"))){
					const dayData: EklaseTypes.LessonDay = {
						date: iterDate.toLocaleDateString("lv-LV"),
						lessons: []
					};

					iterDate = new Date(iterDate.valueOf() + 24 * 3600 * 1000); // After use, increment days by 1 for the next iteration

					for(const lesson of Array.from(day.querySelectorAll("tr"))){
						const lessonData: EklaseTypes.Lesson = {
							index: "",
							lesson: "",
							classroom: "",
							homework: []
						};

						const lessonIndex = lesson.querySelector(".first-column .number");
						const lessonName = lesson.querySelector(".first-column .title");
						const classroom = lesson.querySelector(".first-column .title .room");

						if(lessonIndex) lessonData.index = lessonIndex.innerHTML;
						if(classroom) lessonData.lesson = classroom.innerHTML;
						if(lessonName) {
							const lessonMatch = lessonName.innerHTML.match(/(?<lesson>\p{L}+)/u);

							if(lessonMatch && lessonMatch.groups){
								lessonData.lesson = lessonMatch.groups.lesson;
							}
						}

						const homeworkElArr = lesson.querySelectorAll(".hometask > span");
						const homeworkDataArr = [];

						if(homeworkElArr.length !== 0){
							for(const el of Array.from(homeworkElArr)){
								const homeworkData: EklaseTypes.Homework = {
									author: "",
									time: "",
									date: ""
								};
								
								let hwMetadata: any;
								const titleAttr = el.getAttribute("title");

								if(titleAttr){
									hwMetadata = titleAttr.match(/^(?<date>\d{2}\.\d{2}\.\d{4})\. (?<time>(\d+):(\d+)): (?<author>[\p{L} ]+) (\(labots (?<modifydate>\d{2}\.\d{2}\.\d{4})\. (?<modifytime>(\d+):(\d+))\))?/u);	
								}
								
								const hwInfoEl = el.querySelector("p");
	
								if(hwInfoEl){
									homeworkData.info = hwInfoEl.innerText;
								}
	
								const hwLink = el.querySelector("a");
	
								if(hwLink){
									homeworkData.link = {
										text: hwLink.innerText.trim(),
										url: `https://my.e-klase.lv/${hwLink.getAttribute("href")}`
									};
								}
	
								homeworkData.author = hwMetadata.groups.author;
								homeworkData.time = hwMetadata.groups.time;
								homeworkData.date = hwMetadata.groups.date;

								if(hwMetadata.groups.modifydate){
									homeworkData.modifyDate = hwMetadata.groups.modifydate;
									homeworkData.modifyTime = hwMetadata.groups.modifytime;
								}

								homeworkDataArr.push(homeworkData);
							}
						}

						lessonData.homework = homeworkDataArr;

						const themeContainer = lesson.querySelector(".subject div p");
						lessonData.theme = themeContainer && themeContainer.textContent ? themeContainer.textContent : "";

						const gradeContainer = lesson.querySelector(".score .score");
						lessonData.grade = gradeContainer && gradeContainer.textContent ? gradeContainer.textContent : "";

						dayData.lessons.push(lessonData);
					}

					weekData.push(dayData);
				}

				return weekData;
			}, curDate.valueOf());

			if(updateBuffer) this.buffer.homework = data;

			res(data);
		});
	}

	loadMailIDs(updateBuffer = true): Promise<number[]>{
		return new Promise(async (res, rej) => {
			if(!this.page){
				throw this.error.noBrowser;
			}

			const resp = await this.page.goto(this.url.mailIDs);

			if(resp){
				// @ts-ignore
				const data: number[] = await resp.json();

				if(updateBuffer) this.buffer.mail.ids = data;
	
				res(data);
			}
			else{
				rej();
			}
		});
	}

	scrapeMail(mailIDs: number[], updateBuffer = true): Promise<EklaseTypes.MailContent[]>{ // How many emails to retrieve
		return new Promise(async (res, rej) => {
			if(!this.page){
				throw this.error.noBrowser;
			}

			this.page.setRequestInterception(true);

			const reqPayload = {
				messageIds: mailIDs
			}

			this.page.once("request", interceptedRequest => {
				interceptedRequest.continue({
					method: "POST",
					postData: JSON.stringify(reqPayload),
					headers: {
						...interceptedRequest.headers(),
						"Content-type": "application/json"
					}
				});

				this.page?.setRequestInterception(false);
			});

			const resp = await this.page.goto(this.url.mailContent);

			if(resp){
				// @ts-ignore
				const data: EklaseTypes.MailContent[] = await resp.json();

				if(updateBuffer) this.buffer.mail.content = data;

				res(data);
			}
			else{
				rej();
			}
		});
	}

	scrapeAll(): Promise<void>{
		return new Promise<void>(async (res, rej) => {
			await this.scrapeRecentGrades();
			await sleep(2000);
			this.buffer.homework = await this.scrapeWeek(new Date(2021, 0, 18));
			await sleep(500);
			await this.loadMailIDs();
			await this.scrapeMail(this.buffer.mail.ids.slice(0, 20));

			res();
		});
	}

	checkForNewGrades(): Promise<EklaseTypes.RecentGrade[]>{
		return new Promise<EklaseTypes.RecentGrade[]>(async (res, rej) => {
			const updatedGrades: EklaseTypes.RecentGrade[] = await this.scrapeRecentGrades(false);
			const newGrades: EklaseTypes.RecentGrade[] = [];

			// Hopefully it's very unlikely that consecutive grades have the exact same subject, date and mark
			// but tbh this is a very shit solution

			for(let i = 0; i < updatedGrades.length; i++){
				if(compareRecentGrades(updatedGrades[i], this.buffer.recentGrades[i])) break;

				newGrades.push(updatedGrades[i]);
			}

			res(newGrades);
		});
	}

	checkForNewMail(updateBuffer = true): Promise<number[]>{ 
		return new Promise(async (res, rej) => {
			const freshIDs = await this.loadMailIDs(false);
			const curLength = this.buffer.mail.ids.length; // Set it here for future use in the case that updateBuffer is true

			if(freshIDs.length !== curLength){ // If the length isn't the same, new mail has been received
				if(updateBuffer) this.buffer.mail.ids = freshIDs;
				res(freshIDs.slice(0, freshIDs.length - curLength));
			}
			else{
				res([]);
			}
		});
	}

	countUnreadMail(): Promise<number>{
		return new Promise<number>(async (res, rej) => {
			if(!this.page){
				throw this.error.noBrowser;
			}

			await this.page.goto(this.url.grades);

			const data = await this.page.evaluate(() => {
				const el = document.querySelector(".widget-notifications-primary .widget-count");

				if(el){
					return parseInt(el.textContent ? el.textContent : "0");
				}
				else{
					return 0;
				}
			});

			res(data);
		});
	}

	getUnreadMail(maxPages = 5): Promise<EklaseTypes.MailContent[]>{ // How many pages the code will search (Equivalent to the last 20N emails)
		// Inefficient if the unread mail is spread out
		return new Promise<EklaseTypes.MailContent[]>(async (res, rej) => {
			// Count amount of unread mail

			const totalUnread:number = await this.countUnreadMail();
			const unreadMail:EklaseTypes.MailContent[] = [];

			if(totalUnread === 0) {
				res([]);
				return;
			}
			
			await this.loadMailIDs(); // Update ID buffer

			for(let i = 0; i < maxPages; i++){ // Using a loop here, so the API wouldn't need to load all mail at once
				const mailPage: EklaseTypes.MailContent[] = await this.scrapeMail(this.buffer.mail.ids.slice(i * 20, (i + 1) * 20));
				unreadMail.push(...mailPage.filter(mail => mail.status === "unread"));

				if(unreadMail.length === totalUnread) break;
			}

			res(unreadMail);
		});
	}

	stop(): Promise<boolean>{
		return new Promise<boolean>((res, rej) => {
			if(this.browser === undefined || this.browser === null){
				console.warn("Attempted to close an unopened browser!");
				res(false);

				return;
			}
			else{
				this.browser.close().then(() => {
					res(true);
				});
			}
		});
	}
}

export declare namespace EklaseTypes {
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
		attachments: string[],
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
