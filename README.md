# eklasewrapper

`eklasewrapper` is an npm package that makes connecting to e-klase and scraping data from it as easy as possible. The only reason this package exists is because SIA "Izglītības sistēmas" is a buzzkill and doesn't want to release an official API (Even though MyKoob has one). 

## How it works

E-klase is accessed using a headless chrome browser with Puppeteer. Authentication is simply just sending a request to `https://my.e-klase.lv/?v=15` with login credentials. Data is gathered using requests to the internal e-klase API where possible and, where it isn't possible, it just scrapes the HTML elements. Most methods require the e-klase subscription, but in a future version I will make the method change the destination URL based on whether the authenticated account has a subscription. Right now it is possible to change the destination URLs by changing the `url` property of a `EklaseWrapper` instance. 

## Example

```ts
import { EklaseWrapper } from "eklasewrapper"

const username = "mazaisjanitis"
const password = "drosaparole"

(async () => {
  const wrapper = new EklaseWrapper(username, password);

  // Initialization

  await wrapper.launch();
  await wrapper.authenticate();

  // Obtaining data

  const recentGrades = await wrapper.scrapeRecentGrades();

  console.log(recentGrades);
  /*
    Output:
    [
      { lesson: "Literatūra", date: "10.01.", grade: "5" },
      { lesson: "Matemātika", date: "06.01.", grade: "9" },
      { lesson: "Sports", date: "12.01.", grade: "1" },
      ...
    ]
  */
  
  await wrapper.stop();
})();
```

## Reference


### ```class EklaseWrapper```

#### `EklaseWrapper(username: string, password: string, debug = false)`

`username` and `password` are your e-klase login credentials.
`debug` sets whether the Puppeteer browser is headless or not
  
#### `launch(): Promise<void>`
Launches the Puppeteer browser and goes to `https://www.e-klase.lv/`

#### `authenticate(): Promise<number>`
Authenticates using login credentials given in the constructor with a request to `https://my.e-klase.lv/?v=15`.

Promise resolves to the status of the response or, if for whatever reason the request failed to be made, resolves to `0`

#### `scrapeRecentGrades(updateBuffer = true): Promise<EklaseTypes.RecentGrade[]>`
*Requires e-klase subscription*

The browser goes to `https://my.e-klase.lv/Family/Home` and scrapes the recent grades widget.

`updateBuffer` sets whether the method should update the `recentGrades` property of the internal buffer of the `EklaseWrapper` instance. 

Promise resolves to an array of [EklaseTypes.RecentGrade](#RecentGrade)

#### `scrapeWeek(date: Date, updateBuffer = true): Promise<EklaseTypes.LessonDay[]>`
*Requires e-klase subscription by default*

The browser goes to `https://my.e-klase.lv/Family/Diary` and scrapes the week's schedule. By default this method uses the URL from having an account with a subscription. 

`date` is a date of a day within the week you want to retrieve data from.
`updateBuffer` sets whether the method should update the `week` property of internal buffer of the `EklaseWrapper` instance. 

Promise resolves to an array of [EklaseTypes.LessonDay](#LessonDay)

#### `loadMailIDs(updateBuffer = true)`: Promise<number>
*Requires e-klase subscription by default*

Sends a request to `https://my.e-klase.lv/api/family/mail/folder-message-ids/standardType_fmft_inbox` and obtains the IDs of all mail archived by e-klase for the authenticated account. 

`updateBuffer` sets whether the method should update the `mail.ids` property of the internal buffer of the `EklaseWrapper` instance. 

#### `scrapeMail(mailIDs: number[], updateBuffer = true): Promise<EklaseTypes.MailContent[]>`
*Requires e-klase subscription by default*

Sends a request to `https://my.e-klase.lv/api/family/mail/messages` to obtain emails.

`mailIDs: number[]` is an array of the IDs of the emails needed
`updateBuffer` sets whether the method should update the `mail.ids` property of the internal buffer of the `EklaseWrapper` instance. 

Promise resolves to an array of [EklaseTypes.MailContent](#MailContent)

#### `scrapeAll(): Promise<void>`
*Requires e-klase subscription by default*

Updates the entire internal buffer of the `EklaseWrapper` instance.

#### `checkForNewGrades(): Promise<EklaseTypes.RecentGrade[]>` WIP
*Requires e-klase subscription*

Checks for and retrieves new grades that aren't in the internal buffer of the `EklaseWrapper` instance. This method *should* work, but it will fail if a new grade has the exact same lesson, date and grade as a previous grade.

Promise resolves to an array of [EklaseTypes.RecentGrade](#RecentGrade)

#### `checkForNewMail(updateBuffer = true): Promise<number[]>`
*Requires e-klase subscription by default*

Checks for and retrieves new mail that isn't in the internal buffer of the `EklaseWrapper` instance.

`updateBuffer` sets whether the method should update the `mail.ids` property of the internal buffer of the `EklaseWrapper` instance. 

Promise resolves to an array of the IDs of the new emails.

#### `countUnreadMail(): Promise<number>`
*Requires e-klase subscription by default*

Goes to `https://my.e-klase.lv/Family/Home` and scrapes HTML elements in order to retrieve the total amount of emails that have status `unread`.

Promise resolves to the count of the unread emails.

#### `getUnreadMail(maxPages = 5): Promise<EklaseTypes.MailContent[]>`
*Requires e-klase subscription by default*

Retrieves all emails that have status `unread`. Probably inefficient if the unread emails are spread out (Many emails are between occurences of unread emails)

`maxPages` sets how many page equivalents the method should check for unread emails. Total max email check count is `maxPages * 20`

Promise resolves to an array of [EklaseTypes.MailContent](#MailContent)

#### `stop(): Promise<boolean>`

Stops the Puppeteer browser instance.

Resolves to true if successful, resolves to false if there isn't a Puppeteer browser running.

### `namespace EklaseTypes`

#### `RecentGrade` 
* `lesson: string`
* `grade: string`
* `date: string`

#### `Attachment`
* `text: string`
* `url: string`

#### `Homework`
* `author: string`
* `time: string`
* `date: string`
* `info?: string` - The homework description
* `link?: Attachment` - An attached URL to homework
* `modifyDate?: string`
* `modifyTime?: string`

#### `Lesson`
* `index: string` - Which lesson in order it is
* `lesson: string`
* `classroom: string`
* `homework: Homework[]` - An array of homework bound to the lesson
* `theme?: string` - The theme of the lesson
* `grade?: string`

#### `LessonDay`
* `lessons: Lesson[]`
* `date: string`

#### `MailContent`
* `attachments: string[]` - WIP
* `authorId: number`
* `authorName: string`
* `body: string` - The body of the email formatted in HTML
* `draftRecipients?: number[]` - Not tested
* `draftType?: any` - I have no idea what this property on the response email does
* `followUpStatus: string` - Not tested
* `id: number` - The e-mail ID
* `previousMessageId?: number` - Not tested
* `recipientsData` - Not tested
  * `hideRecipients: boolean`
  * `loadRecipientsSeparately: boolean`
  * `recipients: number[]` - I'm only assuming that recipients is an array of recepient IDs
* `status: string` - If the e-mail has been read, this property is `read`, otherwise it is `unread`
* `subject: string`
* `timeCreated: Date`

#### `Mail`
* `ids: number` - All IDs of emails that e-klase has archived
* `content: MailContent[]` - An array of the most recent emails requested

#### `ScrapeBuffer`
* `recentGrades: RecentGrade[]` - An array of the output of the most recent request to `.scrapeRecentGrades()`
* `homework: LessonDay[]` - An array of the output of the most recent call to `.scrapeWeek()`
* `mail: Mail` - Explained under [Mail](#Mail)

