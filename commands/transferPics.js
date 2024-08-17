import { SlashCommandBuilder } from "@discordjs/builders";

export const data = new SlashCommandBuilder()
  .setName("transfer-pics")
  .setDescription("Transfers all pics in the channel to target channel");
export async function execute(interaction) {
  interaction.deferReply("Transferring pics...");

  let channel = interaction.channel;
  let messages = [];

  let message = await channel.messages
    .fetch({ limit: 1 })
    .then(messagePage => (messagePage.size === 1 ? messagePage.at(0) : null));

  while (message) {
    await channel.messages
      .fetch({ limit: 100, before: message.id })
      .then(messagePage => {
        messagePage.forEach(msg => {
          if (msg.attachments.size > 0) {
            msg.attachments.forEach(attachment => {
              messages.push(attachment.url);
            });
          }
        });

        // Update our message pointer to be the last message on the page of messages
        message = 0 < messagePage.size ? messagePage.at(messagePage.size - 1) : null;
      });
  }
  let len = messages.length;
  console.log(`Collected ${len} pictures`)


  // this is bad code but it works
  // ideally u get target channel from the user as a parameter but this works to transfer the pics to new pics channel
  let targetGuild = interaction.client.guilds.cache.get("1272722086103613472");
  let targetChannel = targetGuild.channels.cache.get("1272724312461148190");
  messages.reverse()
    .forEach(pic => {
      targetChannel.send(pic);
    });
  interaction.followUp(`Transferred ${len} pictures`);
  console.log(`Transferred ${len} pictures`)
}
