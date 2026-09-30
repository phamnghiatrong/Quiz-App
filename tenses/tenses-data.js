/* tenses-data.js - Dữ liệu cho mục "12 thì tiếng Anh" (chỉ chứa dữ liệu, không có logic).
 * Sửa nội dung lý thuyết / câu hỏi ở file này; giao diện và logic nằm trong tenses.js. */

/* ---------- TIMES/ASPECTS ---------- */
export const TIMES=[{id:"present",vi:"Hiện tại"},{id:"past",vi:"Quá khứ"},{id:"future",vi:"Tương lai"}];
export const ASPECTS=[{vi:"Đơn",tail:"V"},{vi:"Tiếp diễn",tail:"be + V-ing"},{vi:"Hoàn thành",tail:"have + V3"},{vi:"Hoàn thành tiếp diễn",tail:"have been + V-ing"}];

/* ---------- TENSES ---------- */
export const TENSES=[
/* ---------- HIỆN TẠI ---------- */
{id:"present-simple",time:"present",a:0,vi:"Hiện tại đơn",en:"Present Simple",sk:"S + V(s/es)",
 gist:"Diễn tả thói quen, sự thật hiển nhiên và lịch trình cố định.",
 forms:[{l:"Động từ thường",r:[["+","S + V(s/es)","She <b>works</b> in a bank."],["−","S + do/does + not + V","She <b>doesn't work</b> on Sundays."],["?","Do/Does + S + V?","<b>Does</b> she <b>work</b> here?"]]},
        {l:"Động từ to be",r:[["+","S + am/is/are + N/Adj","I <b>am</b> a student."],["−","S + am/is/are + not","They <b>aren't</b> busy."],["?","Am/Is/Are + S + …?","<b>Is</b> he your brother?"]]}],
 uses:[{t:"Thói quen, hành động lặp lại",en:"I <b>get</b> up at 6 a.m. every day.",vi:"Tôi dậy lúc 6 giờ sáng mỗi ngày."},
       {t:"Sự thật hiển nhiên, chân lý",en:"Water <b>boils</b> at 100°C.",vi:"Nước sôi ở 100 độ C."},
       {t:"Lịch trình, thời gian biểu cố định (kể cả trong tương lai)",en:"The train <b>leaves</b> at 7:30 tonight.",vi:"Tàu rời ga lúc 7 giờ 30 tối nay."},
       {t:"Trạng thái, cảm xúc, sở thích",en:"She <b>likes</b> coffee but she <b>doesn't like</b> tea.",vi:"Cô ấy thích cà phê nhưng không thích trà."}],
 sig:["always","usually","often","sometimes","rarely","never","every day / week","once a week","on Mondays"],
 notes:["Chủ ngữ <b>he / she / it</b> (số ít): động từ thêm <b>-s/-es</b>; câu phủ định và nghi vấn dùng <b>does</b>, động từ chính trở về nguyên mẫu.","Trạng từ tần suất đứng <b>trước</b> động từ thường nhưng <b>sau</b> to be: <i>I <b>often</b> go…</i> / <i>She is <b>always</b> late.</i>","Sau when, if, as soon as, before, after… nói về tương lai vẫn dùng hiện tại đơn: <i>I'll call you when I <b>get</b> home.</i>"],
 mis:[["She don't like milk.","She <b>doesn't</b> like milk."],["Does he likes football?","Does he <b>like</b> football?"]],
 tl:[["dots",36,324,7]],cap:"Lặp lại đều đặn, trải dài qua quá khứ, hiện tại và tương lai."},

{id:"present-continuous",time:"present",a:1,vi:"Hiện tại tiếp diễn",en:"Present Continuous",sk:"S + am/is/are + V-ing",
 gist:"Diễn tả hành động đang xảy ra ngay lúc nói hoặc quanh thời điểm hiện tại.",
 forms:[{l:"Công thức",r:[["+","S + am/is/are + V-ing","I <b>am studying</b> English now."],["−","S + am/is/are + not + V-ing","He <b>isn't watching</b> TV."],["?","Am/Is/Are + S + V-ing?","<b>Are</b> you <b>listening</b> to me?"]]}],
 uses:[{t:"Đang xảy ra tại thời điểm nói",en:"Be quiet! The baby <b>is sleeping</b>.",vi:"Im lặng! Em bé đang ngủ."},
       {t:"Tạm thời, quanh giai đoạn hiện tại",en:"He <b>is working</b> in Da Nang this month.",vi:"Tháng này anh ấy đang làm việc ở Đà Nẵng."},
       {t:"Kế hoạch đã sắp xếp chắc chắn trong tương lai gần",en:"We <b>are meeting</b> our teacher tomorrow morning.",vi:"Sáng mai chúng tôi sẽ gặp thầy (đã hẹn)."},
       {t:"Xu hướng đang thay đổi; phàn nàn với always",en:"The weather <b>is getting</b> colder. / You <b>are always losing</b> your keys!",vi:"Trời đang lạnh dần. / Bạn cứ làm mất chìa khoá suốt!"}],
 sig:["now","right now","at the moment","at present","Look!","Listen!","Be quiet!","today","this week"],
 notes:["Động từ trạng thái (know, like, want, need, understand, believe…) <b>không</b> chia tiếp diễn.","Chú ý chính tả -ing: write → writing, run → running, lie → lying."],
 mis:[["I am knowing the answer.","I <b>know</b> the answer."],["She cooking dinner now.","She <b>is cooking</b> dinner now."]],
 tl:[["wave",148,214]],cap:"Hành động đang diễn ra quanh thời điểm NOW, chưa kết thúc."},

{id:"present-perfect",time:"present",a:2,vi:"Hiện tại hoàn thành",en:"Present Perfect",sk:"S + have/has + V3",
 gist:"Nối quá khứ với hiện tại: hành động đã xảy ra (không nói rõ khi nào) hoặc kéo dài đến nay, kết quả còn liên quan đến hiện tại.",
 forms:[{l:"Công thức",r:[["+","S + have/has + V3/ed","I <b>have finished</b> my homework."],["−","S + have/has + not + V3","She <b>hasn't called</b> me yet."],["?","Have/Has + S + V3?","<b>Have</b> you ever <b>been</b> to Hue?"]]}],
 uses:[{t:"Bắt đầu trong quá khứ, kéo dài đến hiện tại",en:"I <b>have lived</b> here for five years.",vi:"Tôi đã sống ở đây được 5 năm (và vẫn đang sống)."},
       {t:"Trải nghiệm, không nêu thời điểm cụ thể",en:"I <b>have visited</b> Hoi An twice.",vi:"Tôi đã đến Hội An hai lần."},
       {t:"Vừa mới xảy ra, kết quả còn thấy ở hiện tại",en:"She <b>has just finished</b> her report.",vi:"Cô ấy vừa làm xong báo cáo."},
       {t:"Câu \"lần đầu tiên\"",en:"This is the first time I <b>have eaten</b> sushi.",vi:"Đây là lần đầu tôi ăn sushi."}],
 sig:["just","already","yet","ever","never","recently","lately","so far","up to now","since + mốc","for + khoảng","several times"],
 notes:["<b>since</b> + mốc thời gian (since 2020, since Monday); <b>for</b> + khoảng thời gian (for 3 years, for a week).","<b>already</b> dùng trong câu khẳng định, <b>yet</b> dùng trong câu phủ định và nghi vấn, đứng cuối câu.","Không dùng với mốc quá khứ xác định (yesterday, last year, ago…): khi đó phải dùng quá khứ đơn."],
 mis:[["I have seen him yesterday.","I <b>saw</b> him yesterday."],["She has lived here since three years.","She has lived here <b>for</b> three years."]],
 tl:[["x",86],["bar",86,180]],cap:"Bắt đầu ở một điểm trong quá khứ, còn ảnh hưởng hoặc kéo dài đến NOW."},

{id:"present-perfect-continuous",time:"present",a:3,vi:"Hiện tại hoàn thành tiếp diễn",en:"Present Perfect Continuous",sk:"S + have/has been + V-ing",
 gist:"Nhấn mạnh quá trình liên tục của một hành động bắt đầu trong quá khứ và kéo dài đến hiện tại.",
 forms:[{l:"Công thức",r:[["+","S + have/has + been + V-ing","I <b>have been learning</b> English for 3 years."],["−","S + have/has + not + been + V-ing","He <b>hasn't been sleeping</b> well lately."],["?","Have/Has + S + been + V-ing?","How long <b>have</b> you <b>been waiting</b>?"]]}],
 uses:[{t:"Hành động kéo dài liên tục từ quá khứ đến hiện tại, nhấn thời lượng",en:"It <b>has been raining</b> all day.",vi:"Trời mưa suốt cả ngày (đến giờ vẫn mưa)."},
       {t:"Vừa kết thúc, còn để lại dấu vết thấy được",en:"Her eyes are red. She <b>has been crying</b>.",vi:"Mắt cô ấy đỏ. Cô ấy vừa khóc."},
       {t:"Hỏi \"bao lâu rồi\"",en:"How long <b>have</b> you <b>been studying</b> here?",vi:"Bạn học ở đây bao lâu rồi?"}],
 sig:["for","since","all day","all morning","the whole week","How long…?","lately","recently"],
 notes:["So với hiện tại hoàn thành: HTHT nhấn <b>kết quả / số lượng</b> (I have written 3 emails), HTHTTD nhấn <b>quá trình</b> (I have been writing emails all morning).","Không dùng với động từ trạng thái: I have <b>known</b> her for ten years (không nói have been knowing)."],
 mis:[["I have been knowing him for years.","I have <b>known</b> him for years."],["She has been write three letters.","She <b>has written</b> three letters."]],
 tl:[["wave",86,186],["bar0",86,180]],cap:"Kéo dài liên tục từ quá khứ đến NOW, có thể vẫn tiếp tục."},

/* ---------- QUÁ KHỨ ---------- */
{id:"past-simple",time:"past",a:0,vi:"Quá khứ đơn",en:"Past Simple",sk:"S + V2/ed",
 gist:"Diễn tả hành động đã xảy ra và kết thúc tại một thời điểm xác định trong quá khứ.",
 forms:[{l:"Động từ thường",r:[["+","S + V2/V-ed","I <b>visited</b> my grandparents last week."],["−","S + did not (didn't) + V","I <b>didn't visit</b> them last month."],["?","Did + S + V?","<b>Did</b> you <b>visit</b> them?"]]},
        {l:"Động từ to be",r:[["+","S + was/were + N/Adj","She <b>was</b> tired yesterday."],["−","S + was/were + not","They <b>weren't</b> at home."],["?","Was/Were + S + …?","<b>Were</b> you at school yesterday?"]]}],
 uses:[{t:"Đã xảy ra và kết thúc tại thời điểm xác định",en:"We <b>watched</b> a film last night.",vi:"Tối qua chúng tôi xem một bộ phim."},
       {t:"Chuỗi hành động nối tiếp nhau",en:"She <b>came</b> home, <b>had</b> a shower and <b>went</b> to bed.",vi:"Cô ấy về nhà, tắm rồi đi ngủ."},
       {t:"Thói quen trong quá khứ (nay không còn)",en:"When I was a child, I <b>played</b> football every afternoon.",vi:"Hồi nhỏ chiều nào tôi cũng đá bóng."},
       {t:"Hành động ngắn xen vào hành động đang diễn ra",en:"I was sleeping when the phone <b>rang</b>.",vi:"Tôi đang ngủ thì điện thoại reo."}],
 sig:["yesterday","last night / week / year","… ago","in 2020","when I was …","the other day"],
 notes:["Sau <b>did / didn't</b>, động từ trở về nguyên mẫu: <i>Did you <b>go</b>?</i>","Động từ có quy tắc thêm <b>-ed</b>; động từ bất quy tắc dùng cột V2 (xem phần Tra cứu).","<b>was</b> đi với I / he / she / it; <b>were</b> đi với you / we / they."],
 mis:[["Did you went to school yesterday?","Did you <b>go</b> to school yesterday?"],["I have seen him yesterday.","I <b>saw</b> him yesterday."]],
 tl:[["ref",104,"yesterday"],["x",104]],cap:"Một hành động trọn vẹn, nằm ở một điểm xác định trong quá khứ."},

{id:"past-continuous",time:"past",a:1,vi:"Quá khứ tiếp diễn",en:"Past Continuous",sk:"S + was/were + V-ing",
 gist:"Diễn tả hành động đang diễn ra tại một thời điểm xác định trong quá khứ.",
 forms:[{l:"Công thức",r:[["+","S + was/were + V-ing","At 8 p.m. yesterday, I <b>was having</b> dinner."],["−","S + was/were + not + V-ing","They <b>weren't sleeping</b> at midnight."],["?","Was/Were + S + V-ing?","What <b>were</b> you <b>doing</b> at 9 last night?"]]}],
 uses:[{t:"Đang diễn ra tại một thời điểm xác định trong quá khứ",en:"At this time yesterday, I <b>was studying</b> in the library.",vi:"Giờ này hôm qua tôi đang học ở thư viện."},
       {t:"Đang diễn ra thì có hành động khác xen vào (QKTD + when + QKĐ)",en:"I <b>was taking</b> a shower when the phone rang.",vi:"Tôi đang tắm thì điện thoại reo."},
       {t:"Hai hành động song song cùng lúc (while)",en:"While my mom <b>was cooking</b>, my dad <b>was reading</b>.",vi:"Trong khi mẹ nấu ăn thì bố đọc sách."}],
 sig:["at + giờ + yesterday","at this time last week","when","while","all day yesterday"],
 notes:["Hành động <b>dài</b> (bối cảnh) → quá khứ tiếp diễn; hành động <b>ngắn</b> chen vào → quá khứ đơn.","<b>while</b> thường đi với quá khứ tiếp diễn; <b>when</b> thường đi với hành động ngắn (quá khứ đơn)."],
 mis:[["While I walked home, it started to rain.","While I <b>was walking</b> home, it started to rain."],["I was know the answer.","I <b>knew</b> the answer."]],
 tl:[["wave",46,140],["ref",104,"when…"],["x",104]],cap:"Hành động đang kéo dài trong quá khứ; dấu × là hành động ngắn chen vào."},

{id:"past-perfect",time:"past",a:2,vi:"Quá khứ hoàn thành",en:"Past Perfect",sk:"S + had + V3",
 gist:"Diễn tả hành động xảy ra trước một hành động hoặc thời điểm khác trong quá khứ (\"quá khứ của quá khứ\").",
 forms:[{l:"Công thức",r:[["+","S + had + V3/ed","When I arrived, the train <b>had left</b>."],["−","S + had not (hadn't) + V3","I <b>hadn't seen</b> snow before that trip."],["?","Had + S + V3?","<b>Had</b> you <b>finished</b> before she came?"]]}],
 uses:[{t:"Xảy ra trước một hành động khác trong quá khứ",en:"She <b>had cooked</b> dinner before we got home.",vi:"Cô ấy đã nấu xong bữa tối trước khi chúng tôi về."},
       {t:"Xảy ra trước một mốc thời gian trong quá khứ",en:"By 2020, he <b>had worked</b> there for ten years.",vi:"Tính đến năm 2020, anh ấy đã làm ở đó 10 năm."},
       {t:"Câu điều kiện loại 3, câu ước về quá khứ",en:"If I <b>had studied</b> harder, I would have passed.",vi:"Nếu tôi đã học chăm hơn thì tôi đã đỗ."}],
 sig:["before","after","by the time","by + mốc quá khứ","already","until then","when (2 hành động QK)"],
 notes:["Mẹo: trong câu có 2 hành động quá khứ, hành động xảy ra <b>trước</b> dùng QKHT, hành động <b>sau</b> dùng QKĐ.","before + QKĐ, … QKHT · after + QKHT, … QKĐ."],
 mis:[["When I arrived, the film has started.","When I arrived, the film <b>had started</b>."],["After she finished, she had gone home.","After she <b>had finished</b>, she <b>went</b> home."]],
 tl:[["x",60,"1"],["ref",124,"mốc QK"],["x",124,"2"]],cap:"Hành động 1 xảy ra trước hành động/mốc 2, cả hai đều trong quá khứ."},

{id:"past-perfect-continuous",time:"past",a:3,vi:"Quá khứ hoàn thành tiếp diễn",en:"Past Perfect Continuous",sk:"S + had been + V-ing",
 gist:"Nhấn mạnh quá trình kéo dài liên tục cho đến trước một hành động hoặc thời điểm khác trong quá khứ.",
 forms:[{l:"Công thức",r:[["+","S + had been + V-ing","They <b>had been waiting</b> for an hour before the bus came."],["−","S + had not been + V-ing","I <b>hadn't been sleeping</b> long when the alarm went off."],["?","Had + S + been + V-ing?","How long <b>had</b> you <b>been living</b> there?"]]}],
 uses:[{t:"Kéo dài đến trước một hành động khác trong quá khứ",en:"She <b>had been working</b> for 5 hours before she took a break.",vi:"Cô ấy đã làm liên tục 5 tiếng trước khi nghỉ."},
       {t:"Giải thích nguyên nhân của một kết quả trong quá khứ",en:"He was tired because he <b>had been running</b>.",vi:"Anh ấy mệt vì đã chạy (một lúc lâu) trước đó."}],
 sig:["for","since","before","by the time","until then","how long"],
 notes:["Giống HTHTTD nhưng mốc kết thúc nằm trong quá khứ thay vì ở NOW.","Thường đi với <b>for + khoảng thời gian</b> và một hành động quá khứ đơn làm mốc."],
 mis:[["They have been waiting for an hour before the bus came.","They <b>had been waiting</b> for an hour before the bus came."]],
 tl:[["wave",36,126],["ref",126,"mốc QK"]],cap:"Quá trình liên tục trong quá khứ, kéo dài đến một mốc quá khứ khác."},

/* ---------- TƯƠNG LAI ---------- */
{id:"future-simple",time:"future",a:0,vi:"Tương lai đơn",en:"Future Simple",sk:"S + will + V",
 gist:"Diễn tả quyết định tức thời, dự đoán, lời hứa hoặc đề nghị về tương lai.",
 forms:[{l:"Will",r:[["+","S + will + V","I <b>will call</b> you tonight."],["−","S + will not (won't) + V","She <b>won't come</b> to the party."],["?","Will + S + V?","<b>Will</b> you <b>help</b> me?"]]},
        {l:"Be going to (dự định có sẵn)",r:[["+","S + am/is/are + going to + V","I <b>am going to buy</b> a new laptop."],["−","S + am/is/are + not + going to + V","We <b>aren't going to travel</b> this summer."],["?","Am/Is/Are + S + going to + V?","<b>Are</b> you <b>going to study</b> abroad?"]]}],
 uses:[{t:"Quyết định tức thời ngay lúc nói",en:"It's cold. I <b>will close</b> the window.",vi:"Lạnh quá. Để tôi đóng cửa sổ."},
       {t:"Dự đoán theo ý kiến chủ quan",en:"I think it <b>will rain</b> tomorrow.",vi:"Tôi nghĩ mai trời sẽ mưa."},
       {t:"Lời hứa, đề nghị, yêu cầu",en:"I <b>will help</b> you with your homework.",vi:"Tôi sẽ giúp bạn làm bài tập."},
       {t:"Mệnh đề chính của câu điều kiện loại 1",en:"If it rains, we <b>will stay</b> at home.",vi:"Nếu trời mưa, chúng tôi sẽ ở nhà."}],
 sig:["tomorrow","next week / month","in 2030","soon","in + khoảng (in 2 days)","I think / I'm sure","probably","perhaps"],
 notes:["<b>will</b>: quyết định lúc nói, dự đoán không căn cứ. <b>be going to</b>: dự định có từ trước, dự đoán có bằng chứng (Look at those clouds! It's <b>going to</b> rain).","Sau when, if, as soon as, before, after, until không dùng will: <i>When I <b>finish</b>, I'll call you.</i>"],
 mis:[["When I will finish, I will call you.","When I <b>finish</b>, I will call you."],["She will to come tomorrow.","She will <b>come</b> tomorrow."]],
 tl:[["ref",262,"tomorrow"],["x",262]],cap:"Một hành động ở một điểm trong tương lai."},

{id:"future-continuous",time:"future",a:1,vi:"Tương lai tiếp diễn",en:"Future Continuous",sk:"S + will be + V-ing",
 gist:"Diễn tả hành động sẽ đang diễn ra tại một thời điểm xác định trong tương lai.",
 forms:[{l:"Công thức",r:[["+","S + will be + V-ing","At 9 a.m. tomorrow, I <b>will be taking</b> the exam."],["−","S + will not be + V-ing","I <b>won't be working</b> this time next week."],["?","Will + S + be + V-ing?","<b>Will</b> you <b>be using</b> your laptop tonight?"]]}],
 uses:[{t:"Đang diễn ra tại một thời điểm xác định trong tương lai",en:"This time next week, we <b>will be flying</b> to Japan.",vi:"Giờ này tuần sau, chúng tôi đang bay sang Nhật."},
       {t:"Đang diễn ra thì hành động khác xen vào (trong tương lai)",en:"When you arrive, I <b>will be cooking</b> dinner.",vi:"Khi bạn đến, tôi sẽ đang nấu bữa tối."},
       {t:"Hỏi lịch sự về kế hoạch của người khác",en:"<b>Will</b> you <b>be coming</b> to the meeting?",vi:"Bạn có đến buổi họp không?"}],
 sig:["at this time tomorrow","at + giờ + tomorrow","this time next week","all day tomorrow","when + HTĐ"],
 notes:["Là \"quá khứ tiếp diễn\" dời sang tương lai: cùng có mốc thời gian cụ thể và hành động đang dở dang tại mốc đó.","Mệnh đề when/as soon as dùng hiện tại đơn."],
 mis:[["At 8 p.m. tomorrow I will watch the match. (ý: đang xem)","At 8 p.m. tomorrow I <b>will be watching</b> the match."]],
 tl:[["wave",222,300],["ref",262,"mốc TL"]],cap:"Hành động đang dở dang tại một mốc trong tương lai."},

{id:"future-perfect",time:"future",a:2,vi:"Tương lai hoàn thành",en:"Future Perfect",sk:"S + will have + V3",
 gist:"Diễn tả hành động sẽ hoàn thành trước một thời điểm hoặc hành động khác trong tương lai.",
 forms:[{l:"Công thức",r:[["+","S + will have + V3/ed","By 10 p.m., I <b>will have finished</b> my homework."],["−","S + will not have + V3","They <b>won't have finished</b> the bridge by June."],["?","Will + S + have + V3?","<b>Will</b> you <b>have finished</b> it by Friday?"]]}],
 uses:[{t:"Hoàn thành trước một mốc thời gian trong tương lai",en:"By 2028, I <b>will have graduated</b> from university.",vi:"Trước năm 2028, tôi sẽ tốt nghiệp đại học."},
       {t:"Hoàn thành trước một hành động khác trong tương lai",en:"By the time you come back, we <b>will have cleaned</b> the house.",vi:"Trước khi bạn quay lại, chúng tôi sẽ dọn xong nhà."}],
 sig:["by + mốc TL (by tomorrow, by 2030)","by the end of …","by the time + HTĐ","before + mốc TL"],
 notes:["Dấu hiệu gần như luôn có <b>by</b>: by + mốc, by the time + mệnh đề hiện tại đơn.","Mốc là hạn chót (deadline): hành động xong trước hạn đó."],
 mis:[["By the time he will arrive, we will have eaten.","By the time he <b>arrives</b>, we will have eaten."],["By next year, I will finish the course. (ý: xong trước)","By next year, I <b>will have finished</b> the course."]],
 tl:[["x",236],["ref",288,"by …"]],cap:"Hành động xong trước một hạn chót (mốc) trong tương lai."},

{id:"future-perfect-continuous",time:"future",a:3,vi:"Tương lai hoàn thành tiếp diễn",en:"Future Perfect Continuous",sk:"S + will have been + V-ing",
 gist:"Nhấn mạnh thời lượng của một hành động kéo dài liên tục cho đến một mốc trong tương lai.",
 forms:[{l:"Công thức",r:[["+","S + will have been + V-ing","By June, I <b>will have been working</b> here for 5 years."],["−","S + will not have been + V-ing","By 5 p.m., she <b>won't have been waiting</b> long."],["?","Will + S + have been + V-ing?","How long <b>will</b> you <b>have been studying</b> by then?"]]}],
 uses:[{t:"Kéo dài liên tục đến một mốc tương lai, nhấn thời lượng",en:"By next month, I <b>will have been learning</b> English for two years.",vi:"Đến tháng sau là tôi học tiếng Anh được 2 năm."},
       {t:"Kéo dài đến trước một hành động khác trong tương lai",en:"When she retires, she <b>will have been teaching</b> for 30 years.",vi:"Khi nghỉ hưu, bà ấy đã dạy học được 30 năm."}],
 sig:["by + mốc TL + for + khoảng thời gian","by the time","when + HTĐ"],
 notes:["Ít gặp trong giao tiếp hằng ngày, chủ yếu xuất hiện trong bài tập và đề thi.","Nhận diện nhanh: có cả <b>by + mốc tương lai</b> và <b>for + khoảng thời gian</b>."],
 mis:[["By 2030, I will be working here for 10 years.","By 2030, I <b>will have been working</b> here for 10 years."]],
 tl:[["wave",120,290],["ref",290,"by …"]],cap:"Quá trình kéo dài liên tục, tính đến một mốc trong tương lai."}
];

/* ---------- CMPS ---------- */
export const CMPS=[
 {h:"Hiện tại đơn vs Hiện tại tiếp diễn",a:["present","Hiện tại đơn","I <b>work</b> in a bank.","Công việc lâu dài, thường xuyên."],b:["present","Hiện tại tiếp diễn","I <b>am working</b> in a café this summer.","Tạm thời, chỉ trong hè này."],tip:"<b>Mẹo:</b> every day, usually → HTĐ; now, at the moment, this week → HTTD. Động từ trạng thái (know, like, want) luôn dùng HTĐ."},
 {h:"Quá khứ đơn vs Hiện tại hoàn thành",a:["past","Quá khứ đơn","I <b>lost</b> my key yesterday.","Có mốc thời gian, chuyện đã xong."],b:["present","Hiện tại hoàn thành","I <b>have lost</b> my key.","Không nêu thời điểm; hậu quả: giờ vẫn chưa có chìa."],tip:"<b>Mẹo:</b> thấy yesterday, last…, … ago, in 2020 → chắc chắn QKĐ. Thấy just, already, yet, ever, since, for → HTHT."},
 {h:"Hiện tại hoàn thành vs HTHT tiếp diễn",a:["present","Hiện tại hoàn thành","I <b>have read</b> three books this month.","Nhấn kết quả, số lượng đã xong."],b:["present","HTHT tiếp diễn","I <b>have been reading</b> this book for two hours.","Nhấn quá trình, thời lượng."],tip:"<b>Mẹo:</b> câu có con số đếm được (3 books, twice) → HTHT. Câu có all day, for hours, How long → HTHTTD."},
 {h:"Quá khứ đơn vs Quá khứ tiếp diễn",a:["past","Quá khứ tiếp diễn","I <b>was taking</b> a shower…","Hành động dài, làm bối cảnh."],b:["past","Quá khứ đơn","…when the phone <b>rang</b>.","Hành động ngắn chen vào."],tip:"<b>Mẹo:</b> while + QKTD, when + QKĐ. Hai hành động song song cùng lúc: cả hai QKTD."},
 {h:"Quá khứ đơn vs Quá khứ hoàn thành",a:["past","Quá khứ đơn","When I arrived, the train <b>left</b>.","Tôi vừa tới thì tàu mới chạy (nối tiếp)."],b:["past","Quá khứ hoàn thành","When I arrived, the train <b>had left</b>.","Tàu đã chạy trước khi tôi tới."],tip:"<b>Mẹo:</b> hành động xảy ra trước → QKHT, xảy ra sau → QKĐ. Dấu hiệu: before, after, by the time, already."},
 {h:"will vs be going to vs hiện tại tiếp diễn",a:["future","will / be going to","It's hot. I<b>'ll open</b> the window. / Look at the clouds! It<b>'s going to</b> rain.","will: quyết định lúc nói. going to: có bằng chứng, dự định trước."],b:["present","Hiện tại tiếp diễn","I <b>am meeting</b> Lan at 7 tonight.","Lịch hẹn đã sắp xếp cụ thể."],tip:"<b>Mẹo:</b> lịch trình tàu xe, giờ học → hiện tại đơn (The flight <b>leaves</b> at 9). Và nhớ: when, if, as soon as + hiện tại đơn, không dùng will."}
];

/* ---------- VERBS ---------- */
export const VERBS=`be|was/were|been|thì, là, ở
become|became|become|trở thành
begin|began|begun|bắt đầu
break|broke|broken|làm vỡ
bring|brought|brought|mang đến
build|built|built|xây dựng
buy|bought|bought|mua
catch|caught|caught|bắt, bắt kịp
choose|chose|chosen|chọn
come|came|come|đến
cost|cost|cost|có giá
cut|cut|cut|cắt
do|did|done|làm
draw|drew|drawn|vẽ
drink|drank|drunk|uống
drive|drove|driven|lái xe
eat|ate|eaten|ăn
fall|fell|fallen|rơi, ngã
feel|felt|felt|cảm thấy
find|found|found|tìm thấy
fly|flew|flown|bay
forget|forgot|forgotten|quên
get|got|got/gotten|nhận, trở nên
give|gave|given|cho, đưa
go|went|gone|đi
grow|grew|grown|lớn lên, trồng
have|had|had|có
hear|heard|heard|nghe thấy
hold|held|held|cầm, tổ chức
keep|kept|kept|giữ
know|knew|known|biết
learn|learnt/learned|learnt/learned|học
leave|left|left|rời đi
lend|lent|lent|cho mượn
lose|lost|lost|đánh mất
make|made|made|làm, chế tạo
mean|meant|meant|có nghĩa là
meet|met|met|gặp
pay|paid|paid|trả tiền
put|put|put|đặt, để
read|read|read|đọc
ride|rode|ridden|cưỡi, đạp xe
ring|rang|rung|reo, gọi điện
rise|rose|risen|mọc, tăng lên
run|ran|run|chạy
say|said|said|nói
see|saw|seen|nhìn thấy
sell|sold|sold|bán
send|sent|sent|gửi
set|set|set|thiết lập
shut|shut|shut|đóng
sing|sang|sung|hát
sit|sat|sat|ngồi
sleep|slept|slept|ngủ
speak|spoke|spoken|nói
spend|spent|spent|tiêu, dành
stand|stood|stood|đứng
swim|swam|swum|bơi
take|took|taken|cầm, lấy
teach|taught|taught|dạy
tell|told|told|kể, bảo
think|thought|thought|nghĩ
throw|threw|thrown|ném
understand|understood|understood|hiểu
wake|woke|woken|thức dậy
wear|wore|worn|mặc
win|won|won|thắng
write|wrote|written|viết`.split("\n").map(l=>l.split("|"));

/* ---------- SUBJ ---------- */
export const SUBJ=[{t:"I",p:"1"},{t:"You",p:"pl"},{t:"He",p:"3"},{t:"She",p:"3"},{t:"We",p:"pl"},{t:"They",p:"pl"},{t:"My brother",p:"3"},{t:"Lan",p:"3"},{t:"The students",p:"pl"}];

/* ---------- PHRASES ---------- */
/* verb phrases: h = thói quen, e = sự việc, d = kéo dài vài giờ, L = kéo dài nhiều năm */
export const PHRASES=`play|football|hed
watch|TV|hd
cook|dinner|hed
write|an email|e
write|code|hd
read|a book|ed
read|the news|h
clean|the room|he
do|the homework|he
visit|the museum|e
call|the teacher|e
buy|a new phone|e
make|a cake|e
wash|the dishes|he
send|the report|e
finish|the project|e
go|to school|h
take|the bus|h
drink|coffee|h
check|emails|hd
learn|English|L
work|at this company|L
live|in Hanoi|L
study|telecommunications|L
play|the guitar|hdL
teach|at this school|L
wait|for the bus|d
run|in the park|hd
talk|on the phone|d
swim|in the pool|hd
repair|the router|ed
configure|the network|e`.split("\n").map(l=>{const [v,r,tags]=l.split("|"); return {v,r,tags}});

/* ---------- BSIG ---------- */
export const BSIG={"present-simple":{post:"every day"},"present-continuous":{post:"right now"},"present-perfect":{post:"before"},"present-perfect-continuous":{post:"for two hours"},
 "past-simple":{post:"yesterday"},"past-continuous":{post:"at 8 p.m. yesterday"},"past-perfect":{post:"before the class started"},"past-perfect-continuous":{post:"for an hour before the class started"},
 "future-simple":{post:"tomorrow"},"future-continuous":{post:"at this time tomorrow"},"future-perfect":{post:"by next Friday"},"future-perfect-continuous":{post:"for two hours by the time you arrive"}};

/* ---------- DSIG/DTAGS ---------- */
export const DSIG={
 "present-simple":[{post:"every day"},{post:"every weekend"},{post:"once a week"},{post:"on Sundays"},{post:"every morning"}],
 "present-continuous":[{pre:"Look! ",f:"+",tags:"d"},{pre:"Listen! ",f:"+",tags:"d"},{post:"right now",tags:"hed"},{post:"at the moment",tags:"hedL"},{post:"this semester",tags:"L"}],
 "present-perfect":[{adv:"just",f:"+"},{adv:"already",f:"+"},{adv:"never",f:"+"},{post:"twice this year",f:"+?"},{post:"yet",f:"−?"},{adv:"ever",f:"?"}],
 "present-perfect-continuous":[{post:"all day",tags:"d"},{post:"all morning",tags:"d"},{post:"for two hours",tags:"d",also:["present-perfect"]},{post:"since 8 a.m.",tags:"d",also:["present-perfect"]},{post:"for three years",tags:"L",also:["present-perfect"]},{post:"since 2022",tags:"L",also:["present-perfect"]}],
 "past-simple":[{post:"yesterday"},{post:"last weekend"},{post:"two days ago"},{post:"in 2023"},{post:"last night"}],
 "past-continuous":[{post:"at 8 p.m. yesterday"},{post:"at this time last Sunday"},{post:"when the phone rang"},{post:"when the teacher arrived"},{pre:"While it was raining, ",f:"+"}],
 "past-perfect":[{pre:"By the time we arrived, ",adv:"already",f:"+"},{pre:"When I got home, ",adv:"already",f:"+"},{post:"before the class started"},{post:"before we arrived"},{post:"by the end of last year"}],
 "past-perfect-continuous":[{post:"for two hours before the rain started",tags:"d"},{post:"for an hour when the teacher arrived",tags:"d"},{post:"for five years before the company closed",tags:"L"}],
 "future-simple":[{post:"tomorrow"},{post:"next week"},{post:"in two days"},{pre:"I think ",f:"+−"},{pre:"I'm sure ",f:"+"}],
 "future-continuous":[{post:"at this time tomorrow"},{post:"at 9 a.m. next Monday"},{post:"this time next week"},{pre:"When you arrive, ",f:"+−"}],
 "future-perfect":[{post:"by next Friday"},{post:"by the end of this month"},{pre:"By the time you come back, ",f:"+−"},{post:"before 2030"}],
 "future-perfect-continuous":[{post:"for two hours by the time you arrive",tags:"d"},{pre:"By next June, ",post:"for three years",tags:"L"},{post:"for ten years by 2030",tags:"L"}]
};
export const DTAGS={"present-simple":"h","present-continuous":"hedL","present-perfect":"e","present-perfect-continuous":"d","past-simple":"he","past-continuous":"hd","past-perfect":"e","past-perfect-continuous":"d","future-simple":"e","future-continuous":"hd","future-perfect":"e","future-perfect-continuous":"d"};

/* ---------- PARTS ---------- */
export const PARTS=[
{id:"A",type:"mc",title:"Phần A · Chọn đáp án đúng",desc:"Nhận biết thì qua dấu hiệu và ngữ cảnh.",items:[
 {q:"She usually ___ to school by bike.",o:["go","goes","is going","went"],a:1,why:"<b>usually</b> → hiện tại đơn; chủ ngữ <b>she</b> → go thêm -es."},
 {q:"Listen! Someone ___ at the door.",o:["knocks","knocked","is knocking","has knocked"],a:2,why:"<b>Listen!</b> → hành động đang xảy ra lúc nói → hiện tại tiếp diễn."},
 {q:"I ___ my homework yet.",o:["didn't finish","haven't finished","don't finish","hadn't finished"],a:1,why:"<b>yet</b> cuối câu phủ định → hiện tại hoàn thành."},
 {q:"We ___ a great film last night.",o:["watch","have watched","watched","were watching"],a:2,why:"<b>last night</b> là mốc quá khứ xác định → quá khứ đơn."},
 {q:"When I came home, my mother ___ dinner.",o:["cooked","was cooking","cooks","has cooked"],a:1,why:"Mẹ đang nấu (hành động dài) thì tôi về (hành động ngắn) → quá khứ tiếp diễn."},
 {q:"By the time we got to the cinema, the film ___.",o:["started","has started","had started","was starting"],a:2,why:"<b>By the time</b> + QKĐ → phim bắt đầu <b>trước</b> khi chúng tôi đến → quá khứ hoàn thành."},
 {q:"Look at those dark clouds! It ___ rain.",o:["will","is going to","rains","is raining"],a:1,why:"Dự đoán có bằng chứng (mây đen) → <b>be going to</b>."},
 {q:"At this time tomorrow, I ___ on the beach in Nha Trang.",o:["lie","will lie","will be lying","will have lain"],a:2,why:"<b>At this time tomorrow</b> → đang diễn ra tại mốc tương lai → tương lai tiếp diễn."},
 {q:"By the end of this year, they ___ the new bridge.",o:["will finish","will have finished","finish","are finishing"],a:1,why:"<b>By the end of this year</b> → xong trước mốc tương lai → tương lai hoàn thành."},
 {q:"He is exhausted because he ___ all day.",o:["has worked","has been working","works","had worked"],a:1,why:"<b>all day</b> + kết quả thấy ở hiện tại (mệt) → nhấn quá trình → hiện tại hoàn thành tiếp diễn."},
 {q:"\"The phone is ringing.\" – \"OK, I ___ it.\"",o:["answer","am going to answer","will answer","answered"],a:2,why:"Quyết định ngay lúc nói → <b>will</b>."},
 {q:"By next month, I ___ English here for two years.",o:["will study","will have been studying","have studied","am studying"],a:1,why:"<b>By + mốc tương lai</b> + <b>for two years</b> → tương lai hoàn thành tiếp diễn."},
 {q:"Water ___ at 100 degrees Celsius.",o:["boils","is boiling","boiled","will boil"],a:0,why:"Sự thật hiển nhiên → hiện tại đơn."},
 {q:"They ___ for an hour before the bus finally arrived.",o:["waited","have been waiting","had been waiting","were waiting"],a:2,why:"Quá trình kéo dài (<b>for an hour</b>) đến trước một hành động quá khứ (bus arrived) → quá khứ hoàn thành tiếp diễn."}
]},
{id:"B",type:"fill",title:"Phần B · Chia động từ trong ngoặc",desc:"Gõ dạng đúng của động từ (kể cả trợ động từ, chủ ngữ nếu có trong ngoặc). Chấp nhận dạng viết tắt.",items:[
 {q:"My father ___ coffee every morning.",h:"not/drink",a:["does not drink"],why:"every morning → HTĐ; chủ ngữ số ít → doesn't + V."},
 {q:"___ Hue beef noodle soup?",h:"you/ever/eat",a:["have you ever eaten"],why:"ever → hiện tại hoàn thành, hỏi về trải nghiệm."},
 {q:"I ___ in Ho Chi Minh City since 2020.",h:"live",a:["have lived","have been living"],why:"since 2020 → hiện tại hoàn thành (hoặc HTHT tiếp diễn)."},
 {q:"What ___ at 9 p.m. last night?",h:"you/do",a:["were you doing"],why:"at 9 p.m. last night → đang làm gì tại mốc quá khứ → quá khứ tiếp diễn."},
 {q:"She ___ from university two years ago.",h:"graduate",a:["graduated"],why:"two years ago → quá khứ đơn."},
 {q:"Be quiet! The baby ___.",h:"sleep",a:["is sleeping"],why:"Be quiet! → đang xảy ra → hiện tại tiếp diễn."},
 {q:"When I arrived at the party, most guests ___.",h:"already/leave",a:["had already left"],why:"Khách về trước khi tôi đến → quá khứ hoàn thành."},
 {q:"If it rains tomorrow, we ___ at home.",h:"stay",a:["will stay"],why:"Câu điều kiện loại 1: If + HTĐ, S + will + V."},
 {q:"When she ___ her report, she will send it to you.",h:"finish",a:["finishes","has finished"],why:"Mệnh đề thời gian (when) nói về tương lai → dùng hiện tại đơn, không dùng will."},
 {q:"How long ___ English? – For five years.",h:"you/learn",a:["have you been learning","have you learned","have you learnt"],why:"How long + kéo dài đến hiện tại → HTHT tiếp diễn (hoặc HTHT)."},
 {q:"This time next week, we ___ to Japan.",h:"fly",a:["will be flying"],why:"This time next week → tương lai tiếp diễn."},
 {q:"By 2030, I ___ for this company for ten years.",h:"work",a:["will have been working","will have worked"],why:"By 2030 + for ten years → tương lai hoàn thành tiếp diễn."},
 {q:"The sun ___ in the east.",h:"rise",a:["rises"],why:"Sự thật hiển nhiên → hiện tại đơn, chủ ngữ số ít thêm -s."},
 {q:"While I ___ home, it started to rain.",h:"walk",a:["was walking"],why:"while + hành động đang kéo dài → quá khứ tiếp diễn."},
 {q:"They ___ the project by next Friday.",h:"finish",a:["will have finished"],why:"by next Friday → xong trước mốc tương lai → tương lai hoàn thành."}
]},
{id:"C",type:"err",title:"Phần C · Tìm lỗi sai",desc:"Mỗi câu có một phần gạch chân sai. Chọn phần sai (A, B, C hoặc D).",items:[
 {p:["She","have lived","here","since 2019."],a:1,fix:"have lived → <b>has lived</b>",why:"Chủ ngữ she (số ít) → has."},
 {p:["I","have seen","that film","last week."],a:1,fix:"have seen → <b>saw</b>",why:"last week là mốc quá khứ xác định → quá khứ đơn."},
 {p:["Did","you","went","to school yesterday?"],a:2,fix:"went → <b>go</b>",why:"Sau did, động từ ở nguyên mẫu."},
 {p:["He","is knowing","the answer","now."],a:1,fix:"is knowing → <b>knows</b>",why:"know là động từ trạng thái, không chia tiếp diễn."},
 {p:["When I","will finish","my work,","I will call you."],a:1,fix:"will finish → <b>finish</b>",why:"Mệnh đề when chỉ tương lai dùng hiện tại đơn."},
 {p:["While","she","cooked","dinner, the lights went out."],a:2,fix:"cooked → <b>was cooking</b>",why:"while + hành động đang diễn ra → quá khứ tiếp diễn."},
 {p:["By the time","he arrived,","we","have finished dinner."],a:3,fix:"have finished → <b>had finished</b>",why:"By the time + QKĐ → hành động trước dùng quá khứ hoàn thành."}
]},
{id:"D",type:"passage",title:"Phần D · Đoạn văn: My routine and last Christmas",desc:"Chia động từ trong ngoặc để hoàn thành đoạn văn. Bài này dùng nhiều thì trong cùng một ngữ cảnh.",
 text:["I usually ",{h:"get",a:["get"],why:"usually → hiện tại đơn."}," up at 6 a.m. and have breakfast with my family. Right now I ",{h:"write",a:["am writing"],why:"Right now → hiện tại tiếp diễn."}," this paragraph in my room. I ",{h:"study",a:["have been studying","have studied"],why:"for two years, đến nay vẫn học → HTHT tiếp diễn (hoặc HTHT)."}," telecommunications at university for two years. Last Christmas, my family ",{h:"go",a:["went"],why:"Last Christmas → quá khứ đơn."}," to Da Lat. While we ",{h:"walk",a:["were walking"],why:"while + đang diễn ra → quá khứ tiếp diễn."}," around Xuan Huong Lake, it ",{h:"begin",a:["began"],why:"Hành động ngắn chen vào → quá khứ đơn (begin → began)."}," to rain heavily. Before that trip, I ",{h:"never/visit",a:["had never visited"],why:"Trước chuyến đi (mốc quá khứ) → quá khứ hoàn thành."}," Da Lat. Next Christmas, we ",{h:"visit",a:["are going to visit","are visiting","will visit"],why:"Đã đặt khách sạn → kế hoạch có sẵn → be going to / hiện tại tiếp diễn là tự nhiên nhất; will không sai ngữ pháp nhưng kém tự nhiên hơn."}," Hoi An. We booked the hotel last week."]},
{id:"E",type:"rewrite",title:"Phần E · Viết lại câu",desc:"Viết lại câu sao cho nghĩa không đổi, bắt đầu bằng từ gợi ý. Gõ cả câu (không cần dấu chấm).",items:[
 {q:"I started learning English three years ago.",lead:"I have …",a:["I have been learning English for three years","I have learned English for three years","I have learnt English for three years","I have been learning English for 3 years","I have learned English for 3 years","I have learnt English for 3 years"],why:"started … ago → HTHT / HTHTTD + for + khoảng thời gian."},
 {q:"This is the first time I have eaten sushi.",lead:"I have never …",a:["I have never eaten sushi before","I have never eaten sushi"],why:"the first time … = have never … before."},
 {q:"She last saw her grandparents in June.",lead:"She hasn't …",a:["She has not seen her grandparents since June"],why:"last + QKĐ + mốc → hasn't + V3 + since + mốc."},
 {q:"The train left. Then we arrived at the station.",lead:"When we arrived at the station, …",a:["When we arrived at the station the train had left","When we arrived at the station the train had already left"],why:"Tàu chạy trước → quá khứ hoàn thành."},
 {q:"I will finish the report. Then I will send it to you.",lead:"As soon as I …",a:["As soon as I finish the report I will send it to you","As soon as I have finished the report I will send it to you"],why:"As soon as + hiện tại đơn (không dùng will), mệnh đề chính dùng will."}
]}
];
