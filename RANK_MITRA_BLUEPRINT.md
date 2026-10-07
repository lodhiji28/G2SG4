# RANK MITRA / RANK GURU — WEB APPLICATION BLUEPRINT
## MPESB Group-2 Sub-Group-4 Answer-Key Based Rank & Shift Analysis Platform

> **Document Type:** Product + UX + Functional + Data + Technical Blueprint  
> **Primary Goal:** इस blueprint को Google AI Studio में देकर एक production-ready web application का implementation कराया जा सके।  
> **Language/UI:** मुख्य UI Hindi (Devanagari) + आवश्यक English technical terms।  
> **Important:** यह blueprint MPESB Group-2 Sub-Group-4 के वर्तमान answer-key data collection use-case से शुरू होता है, लेकिन architecture reusable और future exam datasets के लिए extensible होना चाहिए।

---

# 1. PRODUCT VISION

एक professional, responsive और data-driven web application बनानी है जहाँ MPESB Group-2 Sub-Group-4 परीक्षा में शामिल विद्यार्थी अपनी official answer key की locally saved **HTML या MHTML** file upload करके अपना raw score, correct/wrong/attempt statistics और comparative rank/analysis प्राप्त कर सकें।

Application का उद्देश्य केवल score calculator बनना नहीं है। इसका उद्देश्य:

- बड़े sample से raw-score based exam analytics बनाना
- shift-wise comparison देना
- category/gender/qualification-wise analytics देना
- individual student's overall और filtered rank दिखाना
- post-code और vacancy structure के संदर्भ में student को analysis देना
- future normalization analysis के लिए clean raw dataset तैयार करना
- privacy-preserving public leaderboard/analytics देना
- duplicate submissions रोकना
- student को limited profile modification सुविधा देना
- administrator को secure data management/export/verification सुविधा देना

---

# 2. CURRENT EXAM CONTEXT

Initial dataset:

- Exam: MPESB Group-2 Sub-Group-4
- Exam period: 23 September to 5 October
- Exam held in two shifts per exam day
- 25 September और 2 October को exam नहीं हुआ
- Total shifts: 22
- Question count paper-wise 100–200 तक हो सकता है; parser को fixed question count assume नहीं करना चाहिए
- Marks: सामान्यतः 1 mark/question के अनुसार source data से calculate करना
- Negative marking: 1/4
- Current analytics: **RAW MARKS ONLY**
- Normalization: **अभी बिल्कुल नहीं**
- Future normalization: बाद के phase में, जब पर्याप्त dataset उपलब्ध हो जाए

> किसी भी official notification/answer key में यदि ऊपर के किसी factual parameter का अलग authoritative value मिले, तो source document को application configuration में authoritative माना जाए। Hard-code करके conflicting assumptions न बनाएं।

---

# 3. CORE PRINCIPLE — RAW DATA FIRST

## 3.1 No normalization in Phase 1

इस application में अभी:

- Normalized marks calculate नहीं होंगे
- Normalized rank नहीं निकलेगी
- Shift difficulty normalization नहीं होगी
- किसी shift को artificially scale नहीं किया जाएगा

सभी current calculations केवल:

**Raw Correct + Raw Wrong + Raw Attempted + applicable negative marking = Raw Score**

पर आधारित होंगे।

## 3.2 Future-ready architecture

Database/schema इस तरह बनाएं कि बाद में:

- normalization formula
- normalized score
- normalization percentile
- normalized rank

जोड़ना संभव हो, लेकिन वर्तमान raw values कभी overwrite न हों।

---

# 4. INPUT: ANSWER KEY FILE

Student को official answer key की locally saved file upload करनी होगी।

Supported formats:

1. `.html`
2. `.htm`
3. `.mhtml`
4. `.mht`

## 4.1 Why local HTML/MHTML

Official answer-key page session-based हो सकती है और direct URL बाद में काम न करे। इसलिए student अपने authenticated answer-key page को:

**Browser → Save Page / Ctrl+S → Single Web Page / HTML या MHTML**

के रूप में locally save करेगा और फिर application में upload करेगा।

## 4.2 File handling principle

Uploaded answer-key file को permanent database में store नहीं करना है।

Flow:

1. User file select करता है
2. Browser/local parser file पढ़ता है
3. Required structured data extract होता है
4. Validation होती है
5. User review करता है
6. Valid data backend को भेजा जाता है
7. Database में केवल structured required data store होता है
8. Original answer-key file server/database में persist नहीं होती
9. User चाहे तो original file अपने device/offline storage में रख सकता है

### Important security/privacy rule

जहाँ संभव हो, parsing client-side करें ताकि raw answer-key document server तक जाए ही नहीं।

यदि किसी MHTML parser के लिए backend processing आवश्यक हो, तो:
- temporary processing
- no permanent storage
- automatic deletion
- strict access control
- size/type validation
- malware-safe parsing

लागू करें।

---

# 5. ANSWER-KEY PARSER ARCHITECTURE

Application को अलग-अलग answer-key formats के लिए **Parser Adapter Architecture** इस्तेमाल करना चाहिए।

उदाहरण:

```text
AnswerKeyParser
 ├── HTMLParserV1
 ├── HTMLParserV2
 ├── MHTMLParserV1
 └── FutureParser...
```

इससे future में MPESB/TCS या answer-key format बदलने पर पूरा application rewrite नहीं करना पड़ेगा।

## 5.1 Parser responsibilities

Parser को source file से कम-से-कम ये data निकालना होगा:

### Candidate data
- Candidate Name
- Roll Number
- Exam Date
- Shift
- Shift ID / Shift Label
- Exam/Post/Group identifier जहाँ उपलब्ध हो

### Question data
हर question के लिए:

- Question Number / Question ID
- Candidate selected answer
- Correct answer
- Question status
- Correct / Wrong / Unattempted
- Question marks, यदि source में उपलब्ध हों
- Any question-specific metadata available in official file

## 5.2 Derived statistics

System calculate करेगा:

- Total Questions
- Attempted
- Correct
- Wrong
- Unattempted
- Correct Marks
- Negative Marks
- Raw Score
- Accuracy %
- Attempt %
- Wrong %
- Correct %
- Maximum Possible Marks
- Score Percentage

### Default negative marking

Negative marking = 1/4.

Formula:

```text
Correct Marks = Correct × 1
Negative Marks = Wrong × 0.25
Raw Score = Correct Marks - Negative Marks
```

यदि किसी official source/document में question marking अलग मिले, तो exam configuration से value पढ़ें।

---

# 6. PARSER VALIDATION

File parse होने के बाद blind submission नहीं होनी चाहिए।

Validation layers:

## Level 1 — File validation
- Supported extension?
- File readable?
- File size acceptable?
- HTML/MHTML structure valid?

## Level 2 — Candidate validation
- Name found?
- Roll number found?
- Exam date found?
- Shift found?

## Level 3 — Question validation
- Questions detected?
- Candidate answers detected?
- Correct answers detected?
- Question count internally consistent?

## Level 4 — Score validation
- Correct + Wrong + Unattempted = Total Questions
- Score mathematically valid
- Negative marking correctly applied
- Duplicate question IDs नहीं
- Missing question IDs flagged

## Level 5 — Source confidence

Parser एक confidence status दे:

- `VERIFIED`
- `WARNING`
- `FAILED`

यदि confidence low है तो user को final submit से पहले स्पष्ट warning दें।

---

# 7. MULTIPLE ANSWER-KEY FORMAT SUPPORT

User द्वारा future में दिए जाने वाले 2–3 sample HTML/MHTML files को देखकर parser को configurable बनाना है।

Google AI Studio implementation को:

1. sample files inspect करनी चाहिए
2. common fields identify करने चाहिए
3. format differences identify करने चाहिए
4. robust parser बनाना चाहिए
5. parser test cases generate करने चाहिए
6. missing/changed HTML structure के लिए fallback logic रखना चाहिए

Hard-coded DOM position पर निर्भर न रहें यदि semantic labels/attributes उपलब्ध हों।

---

# 8. USER SUBMISSION FLOW

## Step 1 — Landing Page

User को स्पष्ट CTA:

**“अपनी Answer Key Upload करें”**

Supported formats दिखें:

- HTML
- HTM
- MHTML
- MHT

Short instruction:

> Official answer-key page को browser में खोलें → Ctrl+S / Save Page → Single Web Page/HTML या MHTML में save करें → यहाँ upload करें।

---

## Step 2 — File Upload

Features:

- Drag & Drop
- Browse File
- File format validation
- File size validation
- Upload progress/loading state
- Parse progress
- Friendly error message

---

## Step 3 — Extracted Data Preview

Upload के बाद system extracted information दिखाए:

- Name
- Roll Number
- Exam Date
- Shift
- Total Questions
- Correct
- Wrong
- Unattempted
- Raw Score

User को बताएं:

> “कृपया extracted details verify करें।”

लेकिन immutable fields को user-editable न बनाएं।

---

# 9. REQUIRED USER PROFILE FIELDS

## 9.1 Mandatory

### Category
User को इनमें से relevant option चुनना होगा:

- UR/Open
- OBC
- SC
- ST
- EWS
- अन्य category केवल official notification में होने पर

Category selection के बिना submission नहीं होगी।

### Gender
Mandatory:

- Male
- Female
- Other / applicable official option

Gender selection के बिना submission नहीं होगी।

---

# 10. OPTIONAL USER PROFILE FIELDS

Optional fields:

- Ex-Serviceman status
- Contract/संविदा status
- Other official reservation/eligibility flags, यदि notification में relevant हों
- Qualifications
- Post Preferences

इन fields को user चाहे तो बाद में भी complete कर सके।

---

# 11. QUALIFICATION MASTER DATA

Official MPESB Group-2 Sub-Group-4 notification/calendar PDF (लगभग 145 pages) source of truth होगा।

PDF मिलने के बाद उसमें से केवल relevant Group-2 Sub-Group-4 posts की eligibility/qualification requirements extract करनी हैं।

## 11.1 Important scope rule

Patwari की 200 vacancies और उसकी specific qualification को अलग standalone target नहीं मानना है।

Focus:

> Group-2 Sub-Group-4 की सभी relevant post codes की qualification requirements.

## 11.2 Qualification categories

जहाँ notification में उपलब्ध हों:

- Graduation degrees
- Diploma
- PGDCA
- CPCT
- Computer-related qualification
- Other prescribed certificates
- Other degree/diploma/certificate requirements

Actual options notification से derive होंगे; manually invented qualifications नहीं जोड़ी जाएँगी।

## 11.3 Multi-select

Student multiple qualifications select कर सकेगा।

Example:

```text
☑ Graduation
☑ CPCT
☑ PGDCA
☐ Diploma
```

---

# 12. POST PREFERENCE MODULE

Group-2 Sub-Group-4 के सभी relevant **Post Codes** को grid/table format में दिखाएं।

Ordering:

- Starting post code → ending post code
- Official notification ordering को प्राथमिकता

User अपनी actual exam-time preference के अनुसार posts select/enter कर सके।

## 12.1 Optional

Post preference filling optional है।

लेकिन UI में recommendation:

> “बेहतर vacancy और preference analysis के लिए अपनी post preferences भरने की सलाह दी जाती है।”

## 12.2 Post preference data

हर selected post के लिए:

- Preference Number
- Post Code
- Post Name
- User selected / not selected

Drag-and-drop ranking useful feature हो सकता है।

---

# 13. VACANCY DATABASE

Official notification से सभी relevant post codes का structured vacancy database बनाना है।

हर post के लिए जहाँ notification में available हो:

- Post Code
- Post Name
- Department/Office
- Total Vacancy
- Male vacancy
- Female vacancy
- Open/UR
- OBC
- SC
- ST
- EWS
- Ex-serviceman
- Divyang/PwD
- Contract/संविदा
- अन्य applicable reservation categories
- Qualification
- Required certificates
- CPCT requirement
- Other eligibility
- Official notes

## 13.1 Vacancy UI

Dedicated:

**“Vacancy & Post Details”**

page होना चाहिए।

User:
- post-wise vacancy देख सके
- category-wise vacancy देख सके
- gender-wise vacancy देख सके
- qualification देख सके
- eligibility notes देख सके

---

# 14. UNIQUE SUBMISSION RULE

एक roll number से केवल एक primary answer-key submission allowed हो।

Unique key:

```text
ExamID + RollNumber
```

यदि same exam के लिए roll number पहले से मौजूद है:

> “इस Roll Number की Answer Key पहले से दर्ज की जा चुकी है।”

Duplicate record create न करें।

## 14.1 Duplicate race-condition protection

Frontend validation पर्याप्त नहीं है।

Database में unique constraint/index अनिवार्य है।

उदाहरण:

```text
UNIQUE(exam_id, roll_number)
```

---

# 15. USER UPDATE POLICY

User को delete option **बिल्कुल नहीं** देना है।

## 15.1 Immutable fields

User इन fields को modify नहीं कर सकता:

- Roll Number
- Candidate Name
- Exam Date
- Shift
- Extracted answer-key score
- Correct
- Wrong
- Attempted
- Raw Score

## 15.2 Editable fields

User बाद में modify कर सकता है:

- Gender, यदि initial selection editable रखा जाए
- Category, यदि business rules अनुमति दें
- Qualifications
- Ex-Serviceman status
- Contract status
- Post Preferences
- अन्य optional profile metadata

> यदि policy के अनुसार category/gender को lock करना हो, तो admin configuration से lock/unlock किया जा सके।

## 15.3 No redundancy

Update हमेशा existing record पर हो:

```text
UPDATE existing_profile
```

न कि:

```text
INSERT new_profile
```

इससे duplicate records नहीं बनेंगे।

---

# 16. USER IDENTITY / PRIVACY

Public leaderboard में candidate की पूरी identity expose नहीं करनी है।

यदि candidate name में multiple words हैं:

Example:

```text
RAHUL KUMAR SINGH
```

Public UI:

```text
RAHUL •••
```

या:

```text
RAHUL K****
```

Implementation में privacy-preserving display helper बनाएं।

### Important

- Full name केवल authorized/self view में दिखे
- Public leaderboard में masked name
- Roll number public leaderboard में नहीं दिखाना
- Exact personal information unnecessary जगह पर नहीं दिखाना
- Export में भी privacy rules लागू हों

---

# 17. MAIN DASHBOARD / HOME PAGE

Main page पर high-level live analytics।

## 17.1 KPI cards

कम-से-कम:

1. Total Students Submitted
2. Overall Average Raw Score
3. Highest Raw Score
4. Lowest Raw Score
5. Total Shifts
6. Highest Scoring Shift
7. Lowest Scoring Shift
8. Last Data Update Time

यदि useful हो:

- Median Score
- P90/P75/P50/P25
- Average Accuracy
- Average Attempt Rate

---

# 18. SHIFT-WISE OVERVIEW

22 shifts के लिए visual analytics।

हर shift:

- Shift ID
- Exam Date
- Shift time
- Number of candidates
- Highest score
- Lowest score
- Average score
- Median
- Score distribution
- Attempt average
- Accuracy average

## 18.1 Shift graph

हर shift के लिए:

- Top/high score
- Bottom/low score
- Average
- Optional median

22 shifts एक readable grid/chart system में दिखें।

---

# 19. SHIFT-WISE ANALYSIS PAGE

Dedicated page:

**“Shift Wise Analysis”**

Filters:

- Shift
- Date
- Gender
- Category
- Qualification
- Score range
- Attempt range
- Accuracy range
- Post preference
- Reservation flags

## 19.1 Dynamic filtering

पूरी application में जहाँ भी data table/chart दिखता है, user को applicable filters मिलें।

Filters reusable component के रूप में बनाएं।

---

# 20. GLOBAL FILTER SYSTEM

User जहाँ भी analytics देख रहा हो, filters लागू कर सके।

Core filters:

- Shift
- Exam Date
- Gender
- Category
- Qualification
- CPCT
- Diploma
- PGDCA
- Graduation type
- Ex-serviceman
- Contract status
- Post Code
- Raw Score range
- Correct range
- Wrong range
- Attempt range

### Filter behavior

Multiple filters combine हों:

```text
Shift = 5
AND
Gender = Female
AND
Category = OBC
AND
Qualification = CPCT
```

---

# 21. COMPARISON ENGINE

User को किसी भी दो shifts compare करने की सुविधा हो।

Example:

```text
Shift 03 vs Shift 17
```

Comparison:

- Candidate count
- Highest raw score
- Lowest raw score
- Average raw score
- Median raw score
- Score distribution
- Average correct
- Average wrong
- Average attempted
- Average accuracy
- Percentile distribution if implemented
- Category-wise comparison
- Gender-wise comparison

### Explicit restriction

No normalization in current comparison.

UI में स्पष्ट label:

> “यह तुलना Raw Marks पर आधारित है; Normalization लागू नहीं है।”

---

# 22. INDIVIDUAL USER PROFILE / MY RANK

हर student के लिए profile dashboard।

## 22.1 Personal score

Show:

- Candidate display name
- Raw Score
- Correct
- Wrong
- Attempted
- Accuracy
- Exam Date
- Shift

## 22.2 Rank cards

कम-से-कम:

### Overall Rank
पूरे submitted dataset में raw score rank.

### Category Rank
Selected category के भीतर rank.

### Gender Rank
Selected gender के भीतर rank.

### Shift Rank
Same shift में rank.

### Qualification Rank
Selected qualification filter/group के भीतर rank.

### Multi-qualification rank
यदि user multiple qualifications select करता है, relevant combined cohort में rank.

### CPCT rank
यदि applicable.

### Diploma/PGDCA/other qualification rank
यदि applicable.

## 22.3 Rank transparency

User को केवल number न दिखाएं।

उदाहरण:

```text
Overall Rank: #128
Among: 8,742 students
Top: 1.46%
```

---

# 23. TOP PERCENTAGE / ACHIEVEMENT SYSTEM

Profile में visual achievement indicator।

Examples:

- Top 1%
- Top 5%
- Top 10%
- Top 25%
- Top 50%

User का percentile/top percentage raw score based dataset से calculate करें।

UI में attractive achievement badge/icon:

```text
🏆 TOP 5%
```

लेकिन fake guarantee या official selection claim न करें।

Text:

> “यह Rank Mitra dataset में आपकी स्थिति है; official result/selection नहीं।”

---

# 24. LEADERBOARD

Dedicated section:

**“Overall Rank List”**

Default page size:

```text
1–50
```

Pagination:

```text
1  2  3  4  5 ... Next
```

Each row:

- Rank
- Masked Name
- Raw Score
- Correct
- Wrong
- Attempted
- Shift
- Category
- Gender
- Relevant qualification badges

Roll number public view में hide करें।

---

# 25. FILTERED LEADERBOARD

Leaderboard को filter किया जा सके:

- Overall
- Shift
- Gender
- Category
- Qualification
- CPCT
- Diploma
- PGDCA
- Post preference
- Score range

हर filtered leaderboard में:

- Rank
- Candidate
- Score
- Relevant cohort size
- Top percentage

---

# 26. TOP 3 MEDAL SYSTEM

हर ranking context में Top 3 को special visual treatment:

- Rank 1 → Gold
- Rank 2 → Silver
- Rank 3 → Bronze

Applicable contexts:

- Overall
- Shift-wise
- Gender-wise
- Category-wise
- Qualification-wise
- Other filtered leaderboard

Top 3 के लिए attractive medal/avatar/card UI।

---

# 27. ANALYTICS BEYOND BASIC RANK

एक intelligent analytics engine बनाया जाए।

Useful metrics:

- Mean
- Median
- Mode where meaningful
- Min
- Max
- Standard deviation
- Score distribution
- Quartiles
- Top 1%
- Top 5%
- Top 10%
- Top 25%
- Candidate count

### Score distribution

Histogram / distribution chart:

```text
0–10
10–20
20–30
...
```

Actual score range dataset के अनुसार dynamically generate करें।

---

# 28. CATEGORY-WISE ANALYSIS

Category-wise:

- Candidate count
- Average
- Median
- Highest
- Lowest
- Top score
- Distribution
- Rank list
- User's category rank

Categories केवल official configured values से।

---

# 29. GENDER-WISE ANALYSIS

Gender-wise:

- Candidate count
- Average score
- Median
- Highest
- Lowest
- Score distribution
- Rank

---

# 30. QUALIFICATION-WISE ANALYSIS

हर qualification के लिए:

- Candidate count
- Average
- Median
- Highest
- Lowest
- Distribution
- Top candidates
- User rank within qualification

Multiple qualification selection के लिए:

```text
Qualification A
AND
Qualification B
```

या configurable logic:

```text
ANY / ALL
```

---

# 31. POST-WISE ANALYSIS

Post preference data उपलब्ध होने पर:

- कितने students ने post चुनी
- category-wise candidate pool
- gender-wise candidate pool
- qualification eligibility
- vacancy count
- score distribution
- user score vs candidate pool
- preference-wise competition

> Selection probability को official prediction की तरह प्रस्तुत नहीं करना है। इसे “data-based indicative analysis” के रूप में label करें।

---

# 32. VACANCY VS COMPETITION VIEW

एक powerful feature:

```text
Post Code
Vacancies
Submitted Eligible Candidates
Average Score
Top Score
User Score
User Rank in Relevant Pool
```

इससे student को समझने में मदद मिलेगी कि किस post में competition कैसा है।

---

# 33. IMPORTANT DISCLAIMER SYSTEM

हर relevant analytics section में छोटा disclaimer:

> “यह analysis केवल Rank Mitra पर submitted candidates के raw data पर आधारित है। यह official MPESB result, official rank, cutoff या selection guarantee नहीं है।”

जहाँ applicable हो:

> “Current analysis में normalization लागू नहीं किया गया है।”

---

# 34. LIVE DATA UPDATE STRATEGY

हर 5–10 seconds polling नहीं करनी है।

Target refresh interval:

**30 minutes**

Implementation:

- Server-side cached analytics
- Database aggregation
- Cache TTL = 30 minutes
- Client periodic refresh = 30 minutes
- Last updated timestamp prominently show करें

Optional:
- Manual “Refresh Data” button, जिसमें abuse prevention/rate limiting हो।

---

# 35. PERFORMANCE ARCHITECTURE

Raw data बढ़ने पर हर request में पूरा database scan नहीं करना है।

Use:

- Indexed columns
- Precomputed aggregate tables/materialized views जहाँ platform support करे
- Cached analytics
- Pagination
- Server-side filtering
- Server-side ranking
- Lazy loading
- Debounced filters

Heavy leaderboard/ranking calculations को cache/precompute किया जा सकता है।

---

# 36. DATABASE DESIGN

Suggested relational model:

## `exams`

```text
id
name
code
exam_start_date
exam_end_date
total_shifts
negative_marking
marks_per_question
status
created_at
updated_at
```

## `candidates`

```text
id
exam_id
roll_number
candidate_name_private
candidate_name_public
exam_date
shift_id
correct
wrong
attempted
unattempted
raw_score
accuracy
category
gender
ex_serviceman
contract_status
created_at
updated_at
```

Unique:

```text
UNIQUE(exam_id, roll_number)
```

## `qualifications`

```text
id
name
type
official_source
active
```

## `candidate_qualifications`

```text
candidate_id
qualification_id
```

Unique:

```text
UNIQUE(candidate_id, qualification_id)
```

## `post_codes`

```text
id
exam_id
post_code
post_name
department
qualification_requirement
notes
```

## `vacancies`

```text
id
post_id
category
gender
reservation_type
vacancy_count
```

## `candidate_post_preferences`

```text
candidate_id
post_id
preference_order
```

Unique:

```text
UNIQUE(candidate_id, post_id)
```

## `shifts`

```text
id
exam_id
shift_number
exam_date
shift_label
```

## `submission_metadata`

```text
id
candidate_id
parser_version
source_format
parser_confidence
submitted_at
updated_at
```

---

# 37. DATA NORMALIZATION RULE

Database normalized होना चाहिए, लेकिन **exam score normalization नहीं**।

इन दोनों concepts को अलग रखें:

### Database normalization
Duplicate/redundant database design रोकने के लिए।

### Exam score normalization
Different shifts के marks adjust करने के लिए।

Current project में पहला allowed है, दूसरा prohibited है।

---

# 38. RANKING ENGINE

Ranking raw score पर आधारित होगी।

Default ranking:

```text
ORDER BY raw_score DESC
```

Tie handling configurable हो:

### Recommended competition ranking

```text
1
2
2
4
```

यदि same score है तो same rank।

Tie-breaker को बिना official rule के official rank का नाम न दें।

UI label:

> “Dataset Rank”

या

> “Indicative Rank”

---

# 39. RANK COHORT DEFINITION

हर rank के साथ cohort स्पष्ट होना चाहिए।

Example:

```text
Overall:
128 / 8,742

OBC:
31 / 2,104

Female:
42 / 3,215

Shift 08:
17 / 412

CPCT:
23 / 1,208
```

इससे misleading ranking कम होगी।

---

# 40. DATA COMPLETENESS INDICATOR

Dashboard में:

- Total submissions
- Complete profiles
- Incomplete profiles
- Qualification filled %
- Post preference filled %
- Category filled %
- Gender filled %

यह analytics quality समझने में मदद करेगा।

---

# 41. INCOMPLETE PROFILE HANDLING

यदि user ने केवल answer key submit की है लेकिन optional fields नहीं भरीं:

- Record valid रहेगा
- Rank overall में शामिल रहेगा
- Category/gender/qualification specific analytics में तभी शामिल होगा जब relevant field उपलब्ध हो
- Profile में completion percentage दिखाएं

Example:

```text
Profile Completion: 65%
```

---

# 42. PROFILE UPDATE FLOW

User को unique recovery/access mechanism चाहिए क्योंकि delete नहीं है और sensitive identity fields immutable हैं।

Recommended:

- Roll Number + one-time verification mechanism
- या secure edit token
- या browser-local secure session + server-side authorization

Security के बिना केवल roll number डालकर किसी दूसरे student की profile edit करने की अनुमति न दें।

---

# 43. USER DELETE RESTRICTION

Student UI में:

- Delete button नहीं
- Delete API नहीं exposed
- Account deletion self-service नहीं

यदि privacy/legal deletion request कभी आवश्यक हो, तो admin-controlled process अलग रखा जा सकता है।

---

# 44. ADMIN PANEL

Admin route:

```text
/admin
```

Production में केवल obscure URL पर्याप्त security नहीं है।

Admin authentication:

- Password
- Secure session
- Rate limiting
- Brute-force protection
- Optional 2FA
- Server-side authorization

> Admin password source code में hard-code या frontend JavaScript में expose नहीं करना है। Environment Secret/secure secret manager का उपयोग करें।

## Admin capabilities

### Dashboard
- Total candidates
- Shift distribution
- Average score
- Highest score
- Lowest score
- Data quality
- Parser failures
- Duplicate attempts

### Candidate management
- Search
- Roll number search
- Name search
- Shift filter
- Category filter
- Score filter
- View complete record

### Data management
- View
- Validate
- Correct allowed metadata where necessary
- Export
- Analytics refresh
- Parser diagnostics

### Export
- CSV
- Excel if supported
- JSON
- PDF reports
- Filtered exports
- Shift-wise exports
- Full anonymized dataset

Admin export में privacy controls रखें।

---

# 45. ADMIN PASSWORD SECURITY

User-provided password को blueprint में literal production credential के रूप में hard-code नहीं करना है।

Implementation:

```text
ADMIN_PASSWORD = environment secret
```

Production deployment से पहले actual password secure environment variable में set करें।

Password:
- plain text database में store न करें
- source code में न रखें
- logs में न दिखाएं
- frontend bundle में न जाए

---

# 46. ADMIN AUDIT LOG

Admin actions log हों:

- Login attempt
- Successful login
- Export
- Data update
- Configuration update
- Parser update
- Vacancy update
- Qualification update

लेकिन sensitive raw credentials log न हों।

---

# 47. NOTIFICATION/PDF SOURCE PROCESSING

जब official 145-page notification PDF उपलब्ध कराया जाए:

AI/processing pipeline:

1. PDF ingest
2. Relevant Group-2 Sub-Group-4 sections identify
3. Post codes extract
4. Post names extract
5. Qualification requirements extract
6. Vacancy tables extract
7. Category-wise vacancy extract
8. Gender-wise vacancy extract
9. Reservation details extract
10. Notes/conditions extract
11. Cross-check extracted values against source pages
12. Admin verification status
13. Publish only verified records

---

# 48. OFFICIAL SOURCE TRACEABILITY

हर vacancy/qualification record के साथ source metadata रखें:

```text
source_document
source_page
source_section
verification_status
verified_by
verified_at
```

इससे admin बाद में देख सके कि कोई value notification के किस page से आई।

---

# 49. ANSWER-KEY DATA TRACEABILITY

Candidate score record में:

```text
parser_version
source_format
source_hash
parse_timestamp
confidence
```

रख सकते हैं।

### Important

Original answer-key file permanently store नहीं करनी है।

Source hash केवल duplicate/diagnostic purpose के लिए optional है, और privacy policy के अनुसार रखना है।

---

# 50. DUPLICATE DETECTION — MULTI-LAYER

Primary:

```text
exam_id + roll_number
```

Secondary optional:

```text
normalized roll number
```

Tertiary fraud/duplicate diagnostic:

- source file hash
- candidate identity fingerprint
- answer pattern similarity

लेकिन किसी legitimate student को गलत duplicate न मानें।

---

# 51. ROLL NUMBER VALIDATION

Roll number:

- trim whitespace
- normalize obvious formatting
- preserve authoritative original value
- case sensitivity according to official format
- leading zeros preserve करें

Example:

```text
00123456
```

को:

```text
123456
```

में convert न करें यदि leading zeros meaningful हैं।

---

# 52. UI DESIGN SYSTEM

Design should feel like:

- Professional exam analytics platform
- Trustworthy
- Modern
- Fast
- Clean
- Data-rich but not cluttered

Avoid:
- excessive gradients
- unnecessary animations
- confusing dashboards
- tiny text
- too many colors

Use clear hierarchy:

```text
Header
↓
KPI cards
↓
Main chart
↓
Filters
↓
Analytics
↓
Tables
```

---

# 53. RESPONSIVE DESIGN

## Desktop

- Full navigation
- Multi-column dashboard
- Large charts
- Data tables

## Tablet

- 2-column cards
- Scrollable tables
- Collapsible filters

## Mobile

- Bottom navigation or compact menu
- Stacked cards
- Horizontal chart scrolling
- Responsive tables/cards
- Sticky important actions
- Touch-friendly controls

Application mobile-first होनी चाहिए।

---

# 54. NAVIGATION

Recommended navigation:

```text
Home
Analytics
Shift Analysis
Compare Shifts
Leaderboard
Vacancies
My Profile
My Rank
About / Methodology
```

Admin:

```text
/admin
```

---

# 55. SEARCH

Global search useful हो:

- Roll Number
- Candidate name (admin/public rules के अनुसार)
- Post Code
- Qualification

Public search में privacy leakage रोकें।

---

# 56. CHART LIBRARY

Charts के लिए reliable responsive library इस्तेमाल करें।

Recommended chart types:

- Line
- Bar
- Histogram
- Box plot
- Donut/pie only where meaningful
- Scatter plot for score vs relevant dimension
- Distribution curve if statistically valid

Charts में:
- tooltip
- legends
- accessible labels
- mobile responsiveness
- download/share option where appropriate

---

# 57. SHIFT COMPARISON UI

User:

```text
Select Shift A
Select Shift B
Compare
```

Comparison screen:

| Metric | Shift A | Shift B | Difference |
|---|---:|---:|---:|
| Candidates | | | |
| Highest | | | |
| Lowest | | | |
| Average | | | |
| Median | | | |
| Avg Correct | | | |
| Avg Wrong | | | |

Raw data only.

---

# 58. DATA FILTER UX

Filters को reusable `FilterBar` component बनाएं।

Features:

- multi-select
- clear all
- selected filter chips
- apply/reset
- URL query state where useful
- mobile bottom sheet

Filter changes के साथ charts और tables update हों।

---

# 59. LOADING / ERROR / EMPTY STATES

हर module के लिए:

### Loading
Skeleton UI

### Empty
```text
इस filter combination के लिए अभी पर्याप्त data उपलब्ध नहीं है।
```

### Error
Human-readable message + retry

### Parser error
Specific reason:

```text
Answer Key format पहचान में नहीं आया।
कृपया official page को Single Web Page/HTML या MHTML format में फिर से save करें।
```

---

# 60. DATA QUALITY RULES

हर submission पर:

- schema validation
- type validation
- range validation
- duplicate validation
- score consistency
- question count consistency
- shift validity
- exam date validity

Invalid records को database में silently insert न करें।

---

# 61. AUDITABLE CALCULATIONS

Score calculation pure deterministic function हो।

Example:

```text
calculateRawScore(correct, wrong, marksPerQuestion, negativeFraction)
```

Unit tests:

```text
correct = 80
wrong = 20
score = 80 - 5 = 75
```

Unattempted questions पर negative marking नहीं।

---

# 62. SECURITY

Must-have:

- HTTPS
- secure headers
- input sanitization
- XSS protection
- CSRF protection where applicable
- SQL injection protection
- rate limiting
- authentication
- authorization
- secure cookies
- password hashing/secrets
- file validation
- content-type validation
- upload size limits
- server-side validation
- database constraints

HTML/MHTML upload के कारण विशेष रूप से XSS/script execution से सावधानी।

Uploaded HTML को rendered DOM के रूप में directly trusted context में display न करें।

---

# 63. PRIVACY

Application केवल analytics के लिए आवश्यक data collect करे।

Avoid unnecessary PII.

Public:
- masked name
- score
- rank
- shift
- broad category/qualification only where privacy-safe

Private:
- full candidate details

Admin:
- authorized access

---

# 64. CONSENT / PRIVACY NOTICE

Submission से पहले concise notice:

> “आपकी Answer Key से आवश्यक academic/analytical data extract करके Rank Mitra dataset में शामिल किया जाएगा। Original Answer Key file को permanent server storage में नहीं रखा जाएगा। Public analytics में व्यक्तिगत पहचान को masked रखा जाएगा।”

Actual legal/privacy wording deployment से पहले review करें।

---

# 65. OFFLINE-FIRST ANSWER-KEY PROCESSING

Preferred architecture:

```text
Browser
  ↓
Local File
  ↓
Client Parser
  ↓
Structured JSON
  ↓
Validation
  ↓
User Confirmation
  ↓
Backend API
  ↓
Database
```

इस architecture से original answer-key file server load/storage से बचती है।

---

# 66. API DESIGN

Suggested endpoints:

```text
POST /api/submissions
GET  /api/stats/overview
GET  /api/stats/shifts
GET  /api/stats/categories
GET  /api/stats/genders
GET  /api/stats/qualifications
GET  /api/leaderboard
GET  /api/me/rank
PATCH /api/me/profile
GET  /api/vacancies
GET  /api/posts
GET  /api/shifts/compare
POST /api/admin/login
GET  /api/admin/candidates
GET  /api/admin/exports
```

No delete endpoint for normal users.

---

# 67. CACHE STRATEGY

Analytics APIs पर cache:

```text
TTL = 30 minutes
```

Cache invalidation:

- new submission
- relevant profile update
- admin data correction
- vacancy/qualification update

यदि every submission पर full cache invalidation expensive हो, तो background aggregation strategy इस्तेमाल करें।

---

# 68. LIVE COUNTER INTERPRETATION

“Live” का अर्थ:

> latest cached/aggregated dataset

न कि real-time every-second database polling.

UI:

```text
Last updated: 12:30 PM
Auto refresh: every 30 minutes
```

---

# 69. DATABASE INDEXES

At minimum:

```text
exam_id
roll_number
shift_id
raw_score
category
gender
exam_date
```

Composite indexes:

```text
(exam_id, raw_score DESC)
(exam_id, shift_id, raw_score DESC)
(exam_id, category, raw_score DESC)
(exam_id, gender, raw_score DESC)
```

Qualification junction table और post preference table पर appropriate indexes।

---

# 70. FREE / LOW-COST DEPLOYMENT STRATEGY

User का लक्ष्य शुरुआत में free/near-free deployment है।

Architecture को vendor-neutral रखें ताकि services बदली जा सकें।

Possible categories:

### Frontend hosting
- Static hosting / serverless hosting

### Backend
- Serverless functions / lightweight API

### Database
- Free-tier relational database

### Storage
- Original answer-key permanent storage की आवश्यकता नहीं
- इसलिए storage cost कम

### Important

Free tiers बदलते रहते हैं। Final deployment के समय current provider limits, bandwidth, database size, function limits और sleeping behavior verify करें।

Application को इस तरह design करें कि एक provider से दूसरे provider पर migrate किया जा सके।

---

# 71. RECOMMENDED INITIAL ARCHITECTURE

एक practical stack:

```text
Frontend:
React / Next.js
+
TypeScript
+
Tailwind CSS

Backend:
Next.js API / Serverless Functions
या separate Node.js API

Database:
PostgreSQL-compatible database

Charts:
Recharts / ECharts / equivalent

Auth:
Secure session/token based system

Hosting:
Free-tier capable modern hosting
```

Exact vendor selection deployment-time constraints देखकर करें।

---

# 72. FUTURE NORMALIZATION MODULE

Phase 2 में:

```text
Raw Score
↓
Shift difficulty analysis
↓
Official/defined normalization formula
↓
Normalized Score
↓
Normalized Rank
```

लेकिन database में:

```text
raw_score
normalized_score
```

अलग fields हों।

Never overwrite:

```text
raw_score
```

---

# 73. FUTURE CUTOFF ANALYSIS

Future feature:

- Category-wise estimated cutoff range
- Shift-wise score distribution
- Vacancy vs score
- Historical comparison

लेकिन labels:

> “Estimated / Dataset-based”

Official cutoff नहीं।

---

# 74. FUTURE SELECTION SIMULATOR

User अपनी:

- category
- gender
- qualification
- post preference
- score

select करके:

```text
Possible competitive position
```

देख सके।

यह official selection prediction नहीं होगा।

---

# 75. FUTURE MULTI-EXAM ARCHITECTURE

Database `exam_id` based होने से future में:

- other MPESB exams
- other shifts
- other recruitment cycles

add किए जा सकें।

Architecture केवल इस exam पर hard-coded नहीं होना चाहिए।

---

# 76. ACCESSIBILITY

- Keyboard navigation
- Proper labels
- Focus states
- Screen-reader-friendly controls
- Sufficient contrast
- No color-only information
- Chart alternatives
- Responsive font sizing

---

# 77. SEO

Public informational pages:

- Title
- Meta description
- Open Graph
- Structured content
- Fast loading
- Semantic HTML

Sensitive candidate data pages should not be indexed.

Admin pages:

```text
noindex
```

---

# 78. SOCIAL SHARING

Optional:

User अपनी achievement share कर सके:

```text
Rank Mitra
Top 5% in submitted dataset
Raw Score: XX
Shift: XX
```

लेकिन:
- Roll number नहीं
- full name नहीं
- sensitive profile information नहीं

Shareable image/card client-side generate हो सकती है।

---

# 79. ANTI-ABUSE

- Rate limit submissions
- CAPTCHA/Turnstile where appropriate
- Login/edit rate limit
- Admin brute-force protection
- API throttling
- Duplicate constraint
- suspicious traffic monitoring

---

# 80. DATA BACKUP

Admin/database side:

- scheduled backups
- backup verification
- restore plan
- export facility

Free-tier environment में provider backup limitations को ध्यान में रखें।

---

# 81. TESTING STRATEGY

## Unit tests

Test:

- score calculation
- negative marking
- rank calculation
- percentile/top %
- masking
- filter logic
- duplicate detection
- parser functions

## Parser tests

At least:

- HTML sample 1
- HTML sample 2
- MHTML sample 1
- MHTML sample 2
- malformed file
- missing field file
- duplicate question file

## Integration tests

- upload → parse → validate → submit
- duplicate submission
- profile update
- rank update
- filter
- shift comparison
- admin login
- export

## Responsive tests

- Mobile
- Tablet
- Desktop

---

# 82. ACCEPTANCE TEST — ANSWER KEY

Given valid answer key:

```text
Candidate found
Roll found
Shift found
Date found
Questions parsed
Correct calculated
Wrong calculated
Attempted calculated
Raw score calculated
```

All values source-consistent होने चाहिए।

---

# 83. ACCEPTANCE TEST — DUPLICATE

Given same:

```text
Exam + Roll Number
```

twice:

Expected:

- first submission succeeds
- second submission rejected
- no duplicate database record
- clear user message

---

# 84. ACCEPTANCE TEST — PROFILE

User:

1. uploads answer key
2. chooses category
3. chooses gender
4. submits
5. later adds qualifications
6. later adds post preferences

Expected:

- same candidate record updated
- no duplicate record
- score unchanged
- roll/name unchanged

---

# 85. ACCEPTANCE TEST — RANK

If two candidates have same raw score:

- configured tie rule consistently applied
- raw score never modified
- rank reproducible

---

# 86. ACCEPTANCE TEST — PRIVACY

Public leaderboard must never expose:

- full roll number
- full private candidate identity
- private answer-key file
- unnecessary personal fields

---

# 87. ACCEPTANCE TEST — NO NORMALIZATION

Any Phase-1 score comparison must satisfy:

```text
Displayed Score == Raw Score
```

No hidden normalization.

UI should visibly state:

> RAW MARKS ONLY — NORMALIZATION NOT APPLIED

---

# 88. ACCEPTANCE TEST — REFRESH

System should not continuously poll every 5/10 seconds.

Target:

```text
30-minute refresh/caching cycle
```

---

# 89. ADMIN ACCEPTANCE TEST

Admin can:

- authenticate
- view candidate
- search candidate
- filter data
- inspect score details
- export data
- inspect parser status
- manage official configuration

Admin cannot accidentally expose credentials.

---

# 90. ERROR MESSAGES

Use simple Hindi/Hinglish messages.

Examples:

### Duplicate
> “इस Roll Number की Answer Key पहले से दर्ज है।”

### Invalid file
> “यह Answer Key format supported नहीं है। कृपया HTML या MHTML file upload करें।”

### Missing data
> “Answer Key से Shift/Date/Questions की जानकारी पूरी तरह नहीं मिल पाई।”

### Profile incomplete
> “आपकी Answer Key submit हो चुकी है। बेहतर analysis के लिए बाकी profile details पूरी करें।”

---

# 91. UX MICROCOPY

Primary CTA:

**“Answer Key Upload करें”**

Secondary:

**“Shift Analysis देखें”**

**“दो Shifts Compare करें”**

**“My Rank देखें”**

**“Vacancy Details देखें”**

**“Leaderboard देखें”**

---

# 92. METHODOLOGY PAGE

Dedicated page:

## “Rank कैसे Calculate होती है?”

Explain:

```text
Correct = +1
Wrong = -0.25
Unattempted = 0
Raw Score = Correct - (Wrong × 0.25)
```

और:

> “Current Rank Mitra analysis raw marks पर आधारित है। Official normalization लागू नहीं किया गया है।”

---

# 93. DATA SOURCE PAGE

Sources:

- Official MPESB notification
- Official answer key
- Official exam information

हर extracted official vacancy/qualification record के साथ source reference रख सकते हैं।

---

# 94. IMPORTANT PRODUCT IMPROVEMENTS INFERRED FROM REQUIREMENTS

नीचे वे features हैं जो user ने explicitly नहीं मांगे, लेकिन इस product को मजबूत बनाने के लिए recommended हैं:

## 94.1 Profile completion meter

```text
65% complete
```

## 94.2 Data confidence badge

```text
Answer Key Verified
```

## 94.3 Methodology transparency

हर score/rank के पास “How calculated?” tooltip।

## 94.4 Dataset size disclosure

```text
Your rank: 128
Dataset: 8,742 candidates
```

## 94.5 Data freshness

```text
Data updated 18 minutes ago
```

## 94.6 Insufficient sample warning

यदि किसी filter में बहुत कम candidates हों:

> “इस group में sample size कम है; comparison को indicative मानें।”

## 94.7 Parser diagnostics

Admin के लिए parser confidence और missing fields।

---

# 95. IMPORTANT: DO NOT OVERPROMISE

Application को यह नहीं कहना चाहिए:

- “आपका selection पक्का है”
- “Official rank यही है”
- “आपका cutoff clear है”
- “आपको यही post मिलेगी”

इसके बजाय:

- “Indicative Rank”
- “Rank Mitra Dataset Rank”
- “Raw Score Analysis”
- “Estimated/Indicative”
- “Official result अलग हो सकता है”

---

# 96. IMPLEMENTATION PHASES

## Phase 1 — Foundation

- Project setup
- Database
- Exam configuration
- Basic UI
- Responsive shell

## Phase 2 — Answer Key Parser

- HTML parser
- MHTML parser
- Sample validation
- Score engine
- Client-side processing

## Phase 3 — Submission

- User profile
- Mandatory category/gender
- Duplicate protection
- Database insert

## Phase 4 — Analytics

- Overview
- Shift analysis
- Category
- Gender
- Qualification
- Leaderboard
- Rank engine

## Phase 5 — Vacancy

- Post codes
- Qualifications
- Vacancy tables
- Post preference

## Phase 6 — Comparison

- Shift A vs Shift B
- Filter engine
- Distribution analytics

## Phase 7 — Admin

- Admin auth
- Candidate management
- Exports
- Audit
- Source verification

## Phase 8 — Optimization

- Caching
- Indexing
- 30-min refresh
- performance
- security
- accessibility

## Phase 9 — Final QA

- Parser QA
- Calculation QA
- Duplicate QA
- Privacy QA
- Responsive QA
- Security QA

---

# 97. GOOGLE AI STUDIO — BUILD INSTRUCTIONS

Google AI Studio को implementation के दौरान निम्न principles strictly follow करने हैं:

1. पहले requirements को समझकर architecture define करो।
2. फिर database schema बनाओ।
3. फिर parser बनाओ।
4. फिर score engine बनाओ।
5. फिर submission flow।
6. फिर analytics।
7. फिर ranking।
8. फिर vacancy/qualification।
9. फिर admin।
10. अंत में optimization और QA।

एक साथ superficial mockup बनाकर task complete न मानें।

---

# 98. SOURCE-FIRST RULE

जब notification PDF और sample answer-key files provide किए जाएँ:

### Notification

हर vacancy/qualification claim source document से verify करो।

### Answer Key

Parser को actual HTML/MHTML samples के against test करो।

यदि source structure अस्पष्ट हो:

- guess न करो
- assumption को flag करो
- parser को defensive बनाओ

---

# 99. NO DATA INVENTION RULE

AI को किसी भी missing:

- post code
- vacancy
- qualification
- category
- gender vacancy
- question answer
- candidate field

को invent नहीं करना है।

Unknown value:

```text
null
```

या:

```text
NOT_AVAILABLE
```

और admin review queue में भेजें।

---

# 100. VERIFICATION GATE

Deployment से पहले mandatory checklist:

```text
[ ] All requirements mapped
[ ] Parser tested against every provided sample
[ ] Score calculation verified
[ ] Negative marking verified
[ ] No normalization
[ ] Duplicate constraint verified
[ ] User delete disabled
[ ] Immutable fields protected
[ ] Editable fields update existing record
[ ] Public identity masked
[ ] Roll number not publicly exposed
[ ] Qualification master verified
[ ] Post codes verified
[ ] Vacancy values verified
[ ] Admin authentication secured
[ ] Admin secret not hard-coded
[ ] 30-minute refresh configured
[ ] Cache tested
[ ] Mobile UI tested
[ ] Desktop UI tested
[ ] Accessibility checked
[ ] Security checks passed
[ ] Export tested
[ ] Backup strategy confirmed
[ ] Error states tested
[ ] Empty states tested
[ ] Final end-to-end test passed
```

---

# 101. FINAL PRODUCT STRUCTURE

Recommended project structure:

```text
rank-mitra/
│
├── app/
│   ├── page
│   ├── analytics/
│   ├── shifts/
│   ├── compare/
│   ├── leaderboard/
│   ├── vacancies/
│   ├── profile/
│   ├── rank/
│   ├── methodology/
│   └── admin/
│
├── components/
│   ├── charts/
│   ├── filters/
│   ├── tables/
│   ├── cards/
│   ├── upload/
│   ├── leaderboard/
│   └── profile/
│
├── lib/
│   ├── parser/
│   ├── scoring/
│   ├── ranking/
│   ├── analytics/
│   ├── privacy/
│   ├── validation/
│   └── cache/
│
├── database/
│   ├── schema/
│   ├── migrations/
│   └── seed/
│
├── tests/
│   ├── parser/
│   ├── scoring/
│   ├── ranking/
│   └── integration/
│
└── docs/
    ├── methodology
    └── data-sources
```

---

# 102. CRITICAL BUSINESS RULES — ONE-PAGE SUMMARY

ये rules किसी भी implementation decision पर override priority रखते हैं:

1. **Raw marks only.**
2. **No normalization in current phase.**
3. Original answer-key file को permanent backend/database storage में नहीं रखना है।
4. जहाँ संभव हो parsing client-side करनी है।
5. Roll number + exam ID unique होगा।
6. Duplicate submission नहीं।
7. User delete नहीं कर सकता।
8. User immutable score/name/roll/date/shift fields modify नहीं कर सकता।
9. User allowed profile fields और post preferences बाद में modify कर सकता है।
10. Update existing record होना चाहिए; duplicate record नहीं बनना चाहिए।
11. Public identity masked होनी चाहिए।
12. Public leaderboard में roll number नहीं।
13. Qualification multi-select हो।
14. Post preference optional हो।
15. Official notification vacancy/qualification का source of truth होगा।
16. सभी 22 shifts analytics में शामिल होंगी।
17. Any two shifts compare किए जा सकें।
18. Overall, shift, category, gender, qualification आदि rankings उपलब्ध हों।
19. Top 3 को Gold/Silver/Bronze visual treatment।
20. Top percentage/achievement indicator।
21. Analytics filters पूरे application में reusable हों।
22. Data refresh/polling लगभग 30 मिनट के cycle पर हो; aggressive polling नहीं।
23. Admin panel secure होना चाहिए।
24. Admin credentials frontend/source code में hard-code नहीं होंगे।
25. Every important calculation deterministic और testable होना चाहिए।
26. Unknown official data invent नहीं करना।
27. Official result/selection की guarantee नहीं देनी।
28. हर major claim/calculation की methodology explainable हो।
29. Mobile और desktop दोनों पर excellent UX।
30. Deployment से पहले complete end-to-end verification अनिवार्य।

---

# 103. FINAL DIRECTIVE TO THE AI BUILDER

इस blueprint को केवल documentation न मानें।

इसे **single source of truth for implementation** मानकर application build करें।

जहाँ requirement स्पष्ट है वहाँ उसे बदलें नहीं।

जहाँ requirement में implementation-level ambiguity है, वहाँ सबसे सुरक्षित, scalable और privacy-preserving implementation चुनें।

जहाँ official source data उपलब्ध कराया जाएगा, वहाँ source को प्राथमिकता दें और अनुमान न लगाएँ।

जहाँ user analytics मांगी गई है, वहाँ raw dataset और cohort definition स्पष्ट रखें।

हर calculation reproducible होनी चाहिए।

हर database entity uniquely identifiable होनी चाहिए।

हर update idempotent होना चाहिए।

हर public output privacy-safe होना चाहिए।

हर admin action authenticated और auditable होना चाहिए।

और सबसे महत्वपूर्ण:

> **पहले सही data extraction → फिर validation → फिर database → फिर analytics → फिर ranking → फिर visualization.**

Beautiful UI से पहले **data correctness** को priority दें।

---

# 104. INPUTS TO BE PROVIDED BEFORE FINAL PRODUCTION BUILD

Final implementation से पहले ये source files provide की जाएँगी:

### A. Official notification/calendar PDF
लगभग 145 pages वाला official document।

### B. Answer Key Sample 1
HTML/HTM format।

### C. Answer Key Sample 2
MHTML/MHT या alternate HTML format।

### D. Answer Key Sample 3
यदि available हो तो दूसरा/तीसरा structural variation।

### E. Any additional official source
यदि vacancy/qualification clarification के लिए उपलब्ध हो।

इन files के बाद implementation team को parser और master-data extraction को वास्तविक source structure के अनुसार finalize करना है।

---

# END OF BLUEPRINT

**Project Name:** Rank Mitra / Rank Guru  
**Primary Dataset:** MPESB Group-2 Sub-Group-4  
**Current Scoring Mode:** RAW MARKS ONLY  
**Normalization:** DISABLED  
**Original Answer-Key Storage:** NOT PERSISTED  
**Duplicate Key:** EXAM + ROLL NUMBER  
**User Delete:** DISABLED  
**Analytics Refresh Target:** 30 MINUTES  
**Primary Goal:** Accurate, privacy-conscious, scalable exam analytics
