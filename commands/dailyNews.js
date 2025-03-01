// commands/dailyNews.js
import { SlashCommandBuilder } from 'discord.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export const data = new SlashCommandBuilder()
  .setName('news')
  .setDescription('Generate and post a daily news summary for the server.');

/**
 * Find or create a news channel
 */
async function getNewsChannel(guild) {
  // Look for an existing channel called "news"
  let newsChannel = guild.channels.cache.find(
    channel => channel.name === 'news' && channel.isTextBased()
  );
  
  // If it doesn't exist and we have permission, create it
  if (!newsChannel) {
    try {
      console.log('Creating a new news channel...');
      newsChannel = await guild.channels.create({
        name: 'news',
        reason: 'Channel for daily server news summaries'
      });
    } catch (error) {
      console.error('Error creating news channel:', error);
      
      // Fall back to a general channel if we can't create one
      newsChannel = guild.channels.cache.find(
        channel => (channel.name === 'general' || channel.name === 'chat') && channel.isTextBased()
      );
      
      if (!newsChannel) {
        // Last resort: use the first text channel we find
        newsChannel = guild.channels.cache.find(channel => channel.isTextBased());
      }
    }
  }
  
  return newsChannel;
}

/**
 * Generate and post the daily news
 */
export async function generateDailyNews(client) {
  try {
    console.log('Generating daily news...');
    
    // Get the main guild
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) {
      console.error('Guild not found.');
      return;
    }
    
    // Get recent messages
    const messages = await collectRecentMessages(guild);
    console.log(`Collected ${messages.length} messages from the last 24 hours.`);
    
    if (messages.length === 0) {
      console.log('No messages to summarize.');
      return;
    }
    
    // Create a map of usernames to user IDs
    const userMap = extractUserMap(messages);
    
    // Format messages and generate summary
    const messageContext = formatMessagesForContext(messages);
    const summary = await generateSummary(messageContext, userMap);
    
    // Format the summary with proper @mentions
    const { formattedSummary, mentionedUsers } = formatFinalSummary(summary, userMap);
    
    // Format the date for the header
    const today = new Date();
    const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
    
    // Find or create news channel and post summary
    const newsChannel = await getNewsChannel(guild);
    if (newsChannel) {
      await newsChannel.send({
        content: `📰 **Daily Server News: ${dateStr}**\n\n${formattedSummary}`,
        allowedMentions: { users: mentionedUsers }
      });
      console.log('Daily news posted successfully!');
    } else {
      console.error('Could not find or create a suitable channel for posting news.');
    }
  } catch (error) {
    console.error('Error generating daily news:', error);
  }
}

/**
 * Manual trigger for the daily news via slash command
 */
export async function execute(interaction) {
  await interaction.deferReply();
  
  try {
    await generateDailyNews(interaction.client);
    await interaction.editReply('Daily news summary generated and posted!');
  } catch (error) {
    console.error('Error executing news command:', error);
    await interaction.editReply('An error occurred while generating the daily news summary.');
  }
}

// Helper function to add delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Collect messages from all text channels for the last 24 hours
 */
async function collectRecentMessages(guild) {
  const messages = [];
  const now = new Date();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  const channels = guild.channels.cache.filter(channel => 
    channel.isTextBased() && !channel.isDMBased()
  );

  for (const [channelId, channel] of channels) {
    try {
      console.log(`Collecting messages from #${channel.name}...`);
      
      let lastMessageId = null;
      let fetchedMessages = [];
      let hasMoreMessages = true;
      
      // Fetch messages in batches
      while (hasMoreMessages) {
        const options = { limit: 100 };
        if (lastMessageId) options.before = lastMessageId;
        
        const batch = await channel.messages.fetch(options);
        if (batch.size === 0) {
          hasMoreMessages = false;
          break;
        }
        
        // Add non-bot messages from the last 24 hours to our collection
        batch.forEach(msg => {
          if (!msg.author.bot && msg.createdAt > twentyFourHoursAgo) {
            fetchedMessages.push({
              author: msg.author.username,
              authorId: msg.author.id,
              content: msg.content,
              timestamp: msg.createdAt,
              channelName: channel.name
            });
          }
        });
        
        // Update the ID for pagination
        lastMessageId = batch.last().id;
        
        // If the oldest message in this batch is older than 24 hours, stop fetching
        if (batch.last().createdAt < twentyFourHoursAgo) {
          hasMoreMessages = false;
        }
        
        // Avoid rate limits
        await delay(1000);
      }
      
      messages.push(...fetchedMessages);
      
    } catch (error) {
      console.error(`Error fetching messages from #${channel.name}:`, error);
    }
  }

  // Sort messages by timestamp
  messages.sort((a, b) => a.timestamp - b.timestamp);
  
  return messages;
}

/**
 * Format the collected messages for context
 */
function formatMessagesForContext(messages) {
  if (messages.length === 0) {
    return "No messages in the last 24 hours.";
  }
  
  return messages.map(msg => 
    `[#${msg.channelName}] ${msg.author}: ${msg.content}`
  ).join('\n');
}

/**
 * Extract a map of all users who participated in conversations
 */
function extractUserMap(messages) {
  const userMap = new Map();
  
  messages.forEach(msg => {
    if (!userMap.has(msg.author)) {
      userMap.set(msg.author, msg.authorId);
    }
  });
  
  return userMap;
}

/**
 * Format the final summary with proper Discord @mentions
 */
function formatFinalSummary(summary, userMap) {
  // Replace bold usernames with @mentions using regex
  let formattedSummary = summary;
  
  // Process all **Username** patterns
  const boldUsernamePattern = /\*\*([\w\d_]+)\*\*/g;
  const matches = [...summary.matchAll(boldUsernamePattern)];
  
  // Find all users that were mentioned in the summary
  const mentionedUsers = new Set();
  matches.forEach(match => {
    const username = match[1];
    if (userMap.has(username)) {
      const userId = userMap.get(username);
      // Replace **Username** with **<@userId>**
      formattedSummary = formattedSummary.replace(
        `**${username}**`, 
        `**<@${userId}>**`
      );
      mentionedUsers.add(userId);
    }
  });
  
  return {
    formattedSummary,
    mentionedUsers: Array.from(mentionedUsers)
  };
}

/**
 * Generate a news summary using Anthropic Claude
 */
async function generateSummary(messageContext) {
  const prompt = `
You are tasked with creating a daily summary for a Discord server focused on technology. The server members discuss computer science, machine learning, AI, cutting-edge tech, startups, and entrepreneurship. They are technically skilled and enjoy building projects.

I'll provide you with Discord messages from the last 24 hours. Your job is to create a fun, engaging summary that highlights key discussions and funny moments.

Guidelines:
1. Start with a single paragraph summary (max 200 words)
2. Make it humorous and engaging
3. Use people's usernames in bold whenever you mention them
4. Include important discussions, jokes, and memorable moments
5. Focus on making it skimmable with clear visual structure
6. End with a "Today's Highlight" section featuring the funniest or most memorable quote

Format your response exactly like this:
"In the last 24 hours, our server has been buzzing with [summary of activities]. **Username1** discussed [topic], while **Username2** debated [another topic]. [Continue with other interesting highlights and conversations]."

🏆 Today's Highlight: **Username** with "[their exact quote]"

Here are the messages from the last 24 hours:

${messageContext}`;

  try {
    // Call Anthropic Claude API
    const response = await axios({
      method: 'post',
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      data: {
        model: 'claude-3-7-sonnet-20250219',
        max_tokens: 1500,
        temperature: 1.0,
        system: "You generate entertaining daily summaries of Discord conversations for tech-focused servers.",
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }
    });

    // Extract the response content
    const summary = response.data.content[0].text;
    
    return summary;
  } catch (error) {
    console.error('Error generating summary with Anthropic Claude:', error);
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    }
    throw error;
  }
}