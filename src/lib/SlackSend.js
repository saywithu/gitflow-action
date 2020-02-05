const { WebClient } = require('@slack/web-api');
const token = "";
const web = new WebClient(token);

exports.postMessage = async () => {
	// Post a message to the channel, and await the result.
	// Find more arguments and details of the response: https://api.slack.com/methods/chat.postMessage
	const result = await web.chat.postMessage({
		channel: "#알림_테스트",
		text: "알림 타이틀",
		username: "배치알림",
		attachments: [
			{
				text: "send message",
				mrkdwn_in: ["text"]
			}
		]
	});

	// await web.chat.postMessage({
	// 	channel: channel,
	// 	text: title,
	// 	username: username,
	// 	attachments: [
	// 		{
	// 			text: sendMessage,
	// 			mrkdwn_in: ["text"]
	// 		}
	// 	]
	// })

	// The result contains an identifier for the message, `ts`.
	console.log(`Successfully send message ${result.ts}`);
}
