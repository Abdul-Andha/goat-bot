// Imports
import { readdirSync } from 'fs';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

// Import node-cron for scheduling tasks
import cron from 'node-cron'; // Add this line

// Setting new client
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Slash Command Handler
const commandFiles = readdirSync("./commands").filter(file => file.endsWith(".js"));
const commands = [];
bot.commands = new Collection();

for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);
  commands.push(command.data.toJSON());
  bot.commands.set(command.data.name, command);
}

// Event Handler
const eventFiles = readdirSync("./events").filter(file => file.endsWith(".js"));

for (const file of eventFiles) {
  const event = await import(`./events/${file}`);
  if (event.once) {
    bot.once(event.name, (...args) => event.execute(...args, commands));
  } else {
    bot.on(event.name, (...args) => event.execute(...args, commands));
  }
}

// Login
bot.login(process.env.TOKEN);

// Schedule a task to run at midnight on the first of every month
cron.schedule('0 0 1 * *', async () => {
  await checkUserInactivity();
});

// Function to check user inactivity
async function checkUserInactivity() {
  console.log('Running user inactivity check...');

  try {
    // Get the guild
    const guild = bot.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      console.error('Guild not found.');
      return;
    }

    // Fetch all members
    await guild.members.fetch();

    // For each member, check their last message
    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue; // Ignore bots

      const lastMessageTimestamp = await getLastMessageTimestamp(member);

      if (lastMessageTimestamp) {
        const daysInactive = (Date.now() - lastMessageTimestamp) / (1000 * 60 * 60 * 24);
        if (daysInactive > 30) {
          await removeMember(member);
        }
      } else {
        // Member has never sent a message
        const daysSinceJoin = (Date.now() - member.joinedTimestamp) / (1000 * 60 * 60 * 24);
        if (daysSinceJoin > 30) {
          await removeMember(member);
        }
      }

      // Add a delay between processing members to avoid rate limits
      await delay(1000); // Wait for 1 second
    }
  } catch (err) {
    console.error('Error checking user inactivity:', err);
  }
}

// Function to get the last message timestamp of a member
async function getLastMessageTimestamp(member) {
  try {
    const channels = member.guild.channels.cache.filter(channel => channel.isTextBased());

    let lastTimestamp = null;

    // Process channels sequentially
    for (const channel of channels.values()) {
      try {
        // Fetch messages in two batches to get up to 200 messages
        let lastMessageId = null;
        let messages = [];

        for (let i = 0; i < 2; i++) {
          const fetchedMessages = await channel.messages.fetch({ limit: 100, before: lastMessageId });
          if (fetchedMessages.size === 0) break;
          messages.push(...fetchedMessages.values());
          lastMessageId = fetchedMessages.last().id;

          // Add a delay between message fetches to avoid rate limits
          await delay(500); // Wait for 0.5 seconds
        }

        const userMessages = messages.filter(msg => msg.author.id === member.id);

        if (userMessages.length > 0) {
          const latestMessage = userMessages.reduce((prev, current) =>
            prev.createdTimestamp > current.createdTimestamp ? prev : current
          );
          if (!lastTimestamp || latestMessage.createdTimestamp > lastTimestamp) {
            lastTimestamp = latestMessage.createdTimestamp;
          }
        }
      } catch (err) {
        console.error(`Error fetching messages in channel ${channel.name}:`, err);
      }

      // Add a delay between processing channels to avoid rate limits
      await delay(500); // Wait for 0.5 seconds
    }

    return lastTimestamp;
  } catch (err) {
    console.error(`Error fetching messages for ${member.user.tag}:`, err);
    return null;
  }
}

// Function to remove member
async function removeMember(member) {
  try {
    // Construct the message content
    const messageContent = process.env.DRY_RUN === 'true'
      ? `[DRY RUN] Would remove member ${member.user.tag} for inactivity.`
      : `Removed member ${member.user.tag} for inactivity.`;

    // Fetch all text channels where the bot has permission to send messages
    const channels = member.guild.channels.cache.filter(channel => 
      channel.isText() && 
      channel.permissionsFor(member.guild.members.me).has('SendMessages')
    );

    // Send the message in each channel
    for (const [channelId, channel] of channels) {
      try {
        await channel.send(messageContent);
      } catch (err) {
        console.error(`Failed to send message in channel ${channel.name}:`, err);
      }
    }

    if (process.env.DRY_RUN === 'true') {
      console.log(`[DRY RUN] Would remove member ${member.user.tag} for inactivity.`);
      return;
    }

    const botMember = await member.guild.members.fetch(member.guild.members.me.id);
    if (!botMember.permissions.has('KICK_MEMBERS')) {
      console.error('Bot lacks KICK_MEMBERS permission.');
      return;
    }

    if (!member.kickable) {
      console.log(`Cannot kick member ${member.user.tag}. They might have higher permissions or roles.`);
      return;
    }

    await member.kick('Inactive for over 30 days');
    console.log(`Removed member ${member.user.tag} for inactivity.`);
  } catch (err) {
    console.error(`Failed to remove member ${member.user.tag}:`, err);
  }
}

// Function to add a delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global error handling
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});