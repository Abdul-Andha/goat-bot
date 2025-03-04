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
    
    // Find or create news channel and post summary
    const newsChannel = await getNewsChannel(guild);
    if (newsChannel) {
      await newsChannel.send({
        content: formattedSummary,
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
  let formattedSummary = summary;
  const mentionedUsers = new Set();
  
  // Process mentions in different formats:
  // 1. Handle @Username format
  const atMentionPattern = /@([\w\d_\s.-]+(\([^)]*\))?)/g;
  let match;
  while ((match = atMentionPattern.exec(summary)) !== null) {
    const fullUsername = match[1].trim();
    // Find the closest matching username in our userMap
    for (const [username, userId] of userMap.entries()) {
      if (fullUsername.includes(username) || username.includes(fullUsername)) {
        const replacement = `<@${userId}>`;
        formattedSummary = formattedSummary.replace(`@${fullUsername}`, replacement);
        mentionedUsers.add(userId);
        break;
      }
    }
  }
  
  // 2. Handle **@Username** format
  const boldAtMentionPattern = /\*\*@([\w\d_\s.-]+(\([^)]*\))?)\*\*/g;
  while ((match = boldAtMentionPattern.exec(summary)) !== null) {
    const fullUsername = match[1].trim();
    // Find the closest matching username in our userMap
    for (const [username, userId] of userMap.entries()) {
      if (fullUsername.includes(username) || username.includes(fullUsername)) {
        const replacement = `**<@${userId}>**`;
        formattedSummary = formattedSummary.replace(`**@${fullUsername}**`, replacement);
        mentionedUsers.add(userId);
        break;
      }
    }
  }
  
  // 3. Handle **Username** format (without @)
  const boldUsernamePattern = /\*\*([\w\d_\s.-]+(\([^)]*\))?)\*\*/g;
  while ((match = boldUsernamePattern.exec(summary)) !== null) {
    const fullUsername = match[1].trim();
    // Skip if it already contains a mention
    if (fullUsername.includes('<@')) continue;
    
    // Find the closest matching username in our userMap
    for (const [username, userId] of userMap.entries()) {
      if (fullUsername.includes(username) || username.includes(fullUsername)) {
        const replacement = `**<@${userId}>**`;
        // Use a more precise replacement to avoid double-replacing
        const exactPattern = new RegExp(`\\*\\*${fullUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*`, 'g');
        formattedSummary = formattedSummary.replace(exactPattern, replacement);
        mentionedUsers.add(userId);
        break;
      }
    }
  }
  
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
You are creating a daily summary for a Discord server focused on technology. The server members discuss computer science, machine learning, AI, tech news, startups, and coding projects. They are technically skilled and enjoy edgy humor.

I'll provide you with Discord messages from the last 24 hours. Your job is to create a summary that highlights key discussions and memorable moments.

YOUR PERSONA: You're "TechBro69", an edgy, sarcastic techie who doesn't hold back. You're blunt, sometimes crude, and love making edgy jokes. You speak in a casual, internet-culture way with occasional leetspeak. You're obsessed with the latest tech trends and always ready with hot takes.

Guidelines:
1. Use Discord markdown formatting liberally for better readability (bold, italics, headings, bullet points)
2. Structure the summary in clear sections rather than one big paragraph
3. Use people's usernames with proper Discord @ mention format
4. Include important discussions, jokes, and memorable moments
5. Maintain an edgy, sarcastic tone throughout 
6. End with a "Today's Highlight" section featuring the most memorable quote

Format your response with sections like this:
**# Daily Tech Trash**
**## Server Vibe Check**
[Brief overview paragraph about today's server mood/activity level]
**## Hot Topics*
• [Topic 1 with usernames and commentary]
**## Tech Corner**
[Any discussions about gadgets, code, or tech news]
**## Random BS**
[Funny moments, memes, or off-topic discussions]
**## 🏆 Quote of the Day**
> "[exact quote]" - **@Username**
Use plenty of Discord markdown: **bold**, *italics*, || spoiler tags ||, > quote blocks, \`\`\`code blocks\`\`\`, and emojis and also make sure not to have too much spacing in the message conservative without it being overly compressed.
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
        max_tokens: 500,
        temperature: 1.0,
        system: "You generate entertaining daily summaries of Discord conversations for tech-focused servers. You adopt an edgy, sarcastic 'TechBro69' persona who uses Discord markdown formatting to create readable, sectioned summaries. Your tone is blunt, sometimes crude, and includes edgy humor while highlighting the day's most interesting conversations.",
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