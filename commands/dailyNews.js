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
    
    // Get recent messages with images
    const { messages, images } = await collectRecentMessagesAndImages(guild);
    console.log(`Collected ${messages.length} messages from the last 24 hours.`);
    console.log(`Collected ${images.length} images from the last 24 hours.`);
    
    if (messages.length === 0) {
      console.log('No messages to summarize.');
      return;
    }
    
    // Create a map of usernames to user IDs
    const userMap = extractUserMap(messages);
    
    // Format messages and generate summary
    const messageContext = formatMessagesForContext(messages);
    const summary = await generateSummary(messageContext, images);

    // Extract sections from the summary
    const sections = extractSections(summary);
    
    // Format the sections with proper @mentions
    const formattedSections = formatSectionsWithMentions(sections, userMap);
    
    // Find or create news channel and post summary sections
    const newsChannel = await getNewsChannel(guild);
    if (newsChannel) {
      // Post each section as a separate message
      for (const section of formattedSections) {
        await newsChannel.send({
          content: section.content,
          allowedMentions: { users: section.mentionedUsers }
        });
        
        // Add a small delay between messages to ensure proper ordering
        await delay(500);
      }
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
 * Collect messages and images from all text channels for the last 24 hours
 */
async function collectRecentMessagesAndImages(guild) {
  const messages = [];
  const images = [];
  const now = new Date();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  const channels = guild.channels.cache.filter(channel => 
    channel.isTextBased() && !channel.isDMBased()
  );

  for (const [channelId, channel] of channels) {
    try {
      console.log(`Collecting messages from #${channel.name}...`);
      
      let lastMessageId = null;
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
            // Collect message content
            messages.push({
              author: msg.author.username,
              authorId: msg.author.id,
              content: msg.content,
              timestamp: msg.createdAt,
              channelName: channel.name
            });
            
            // Debug log for attachments
            if (msg.attachments.size > 0) {
              console.log(`Found ${msg.attachments.size} attachments in message from ${msg.author.username}`);
              
              // Collect images if they exist
              msg.attachments.forEach(attachment => {
                // Get the file extension
                const url = attachment.url;
                console.log(`Attachment URL: ${url}`);
                
                // Check if it's an image file using content type if available or URL extension as fallback
                const contentType = attachment.contentType || '';
                const isImageByType = contentType.startsWith('image/');
                const isImageByExtension = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                const isImage = isImageByType || isImageByExtension;
                
                console.log(`Content Type: ${contentType}`);
                console.log(`Is image by type: ${isImageByType}`);
                console.log(`Is image by extension: ${isImageByExtension}`);
                
                if (isImage) {
                  console.log(`Adding image from ${msg.author.username} to collection`);
                  images.push({
                    url: url,
                    author: msg.author.username,
                    channelName: channel.name,
                    timestamp: msg.createdAt
                  });
                } else {
                  console.log(`Attachment from ${msg.author.username} is not an image`);
                }
              });
            }
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
      
    } catch (error) {
      console.error(`Error fetching messages from #${channel.name}:`, error);
    }
  }

  // Sort messages by timestamp
  messages.sort((a, b) => a.timestamp - b.timestamp);
  
  // Log collected images for debugging
  console.log(`Total images collected: ${images.length}`);
  if (images.length > 0) {
    console.log('Image URLs:');
    images.forEach((img, index) => {
      console.log(`[${index + 1}] ${img.url} by ${img.author} in #${img.channelName}`);
    });
  }
  
  return { messages, images };
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
 * Extract sections from the summary by headers
 */
function extractSections(summary) {
  // Define the regular expressions for section headers
  const sectionHeaders = [
    '**# Daily Tech Trash**',
    '**## Server Vibe Check**',
    '**## Hot Topics**',
    '**## Tech Corner**',
    '**## Random BS**',
    '**## 🏆 Quote of the Day**'
  ];
  
  const sections = [];
  let currentHeader = '';
  let currentContent = '';
  
  // Split by lines to process each line
  const lines = summary.split('\n');
  
  for (const line of lines) {
    const isHeader = sectionHeaders.some(header => line.includes(header));
    
    if (isHeader) {
      // If we already have content for a previous header, save it
      if (currentHeader && currentContent) {
        sections.push({
          header: currentHeader,
          content: currentHeader + '\n' + currentContent
        });
      }
      
      // Start new section
      currentHeader = line;
      currentContent = '';
    } else if (currentHeader) {
      // Add to current section
      currentContent += '\n' + line;
    }
  }
  
  // Don't forget the last section
  if (currentHeader && currentContent) {
    sections.push({
      header: currentHeader,
      content: currentHeader + '\n' + currentContent
    });
  }
  
  return sections;
}

/**
 * Format sections with proper Discord @mentions
 */
function formatSectionsWithMentions(sections, userMap) {
  return sections.map(section => {
    let formattedContent = section.content;
    const mentionedUsers = new Set();
    
    // Process mentions in different formats:
    // 1. Handle @Username format
    const atMentionPattern = /@([\w\d_\s.-]+(\([^)]*\))?)/g;
    let match;
    while ((match = atMentionPattern.exec(section.content)) !== null) {
      const fullUsername = match[1].trim();
      // Find the closest matching username in our userMap
      for (const [username, userId] of userMap.entries()) {
        if (fullUsername.includes(username) || username.includes(fullUsername)) {
          const replacement = `<@${userId}>`;
          formattedContent = formattedContent.replace(`@${fullUsername}`, replacement);
          mentionedUsers.add(userId);
          break;
        }
      }
    }
    
    // 2. Handle **@Username** format
    const boldAtMentionPattern = /\*\*@([\w\d_\s.-]+(\([^)]*\))?)\*\*/g;
    while ((match = boldAtMentionPattern.exec(section.content)) !== null) {
      const fullUsername = match[1].trim();
      // Find the closest matching username in our userMap
      for (const [username, userId] of userMap.entries()) {
        if (fullUsername.includes(username) || username.includes(fullUsername)) {
          const replacement = `**<@${userId}>**`;
          formattedContent = formattedContent.replace(`**@${fullUsername}**`, replacement);
          mentionedUsers.add(userId);
          break;
        }
      }
    }
    
    // 3. Handle **Username** format (without @)
    const boldUsernamePattern = /\*\*([\w\d_\s.-]+(\([^)]*\))?)\*\*/g;
    while ((match = boldUsernamePattern.exec(section.content)) !== null) {
      const fullUsername = match[1].trim();
      // Skip if it already contains a mention
      if (fullUsername.includes('<@')) continue;
      
      // Find the closest matching username in our userMap
      for (const [username, userId] of userMap.entries()) {
        if (fullUsername.includes(username) || username.includes(fullUsername)) {
          const replacement = `**<@${userId}>**`;
          // Use a more precise replacement to avoid double-replacing
          const exactPattern = new RegExp(`\\*\\*${fullUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*`, 'g');
          formattedContent = formattedContent.replace(exactPattern, replacement);
          mentionedUsers.add(userId);
          break;
        }
      }
    }
    
    return {
      content: formattedContent,
      mentionedUsers: Array.from(mentionedUsers)
    };
  });
}

/**
 * Generate a news summary using Anthropic Claude
 */
async function generateSummary(messageContext, images) {
  // Get today's date for the prompt
  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', { 
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Include images if available
  const imageContents = [];
  
  if (images.length > 0) {
    // Take up to 5 most recent images
    const recentImages = images.slice(-5);
    
    for (const image of recentImages) {
      try {
        console.log(`Adding image to API request: ${image.url}`);
        imageContents.push({
          type: "image",
          source: {
            type: "url",
            url: image.url
          }
        });
      } catch (error) {
        console.error('Error including image:', error);
      }
    }
  } else {
    console.log('No images to include in the API request');
  }

  // Use the exact prompt format provided
  const promptTemplate = `You are TechBro69, an AI tasked with creating a daily summary for a tech-focused Discord server. The summary is for:
<formatted_date>
${formattedDate}
</formatted_date>
Your job is to create an engaging, edgy summary of the last 24 hours of Discord messages, highlighting key discussions and memorable moments. You must maintain a sarcastic, blunt, and sometimes crude persona throughout the summary.
Here are the Discord messages from the last 24 hours:
<discord_messages>
${messageContext}
</discord_messages>
Before drafting the summary, work inside <discord_analysis> tags in your thinking block to organize your thoughts and ensure you cover all required elements. Consider the following:
1. List key discussions with usernames involved
2. Note any tech-related conversations
3. Identify standout quotes
4. Describe any shared images
5. Assess overall server mood and activity level
After analyzing, create the summary using the following structure. Each section must be self-contained as they will be sent as separate messages:
**# Daily Tech Trash**
**## Server Vibe Check**
[Brief overview paragraph about today's server mood/activity level]
**## Hot Topics**
• [Topic 1 with usernames and commentary]
• [Topic 2 with usernames and commentary]
• [etc.]
**## Tech Corner**
[Any discussions about gadgets, code, or tech news]
**## Random BS**
[Funny moments, memes, or off-topic discussions]
**## 🏆 Quote of the Day**
> "[exact quote]" - **@Username**
Important guidelines:
1. Use ample Discord markdown: **bold**, *italics*, || spoiler tags ||, > quote blocks, \`\`\`code blocks\`\`\`, and emojis.
2. Be concise without being overly compressed.
3. Maintain an edgy, sarcastic tone throughout. Use casual language and occasional leetspeak.
4. Ensure all specified sections are present and properly formatted.
5. Subtly reference any images shared in the Discord messages.
Remember, you are TechBro69 - don't hold back on the sass and tech enthusiasm!`;

  // Create text content for the prompt
  const textContent = {
    type: "text",
    text: promptTemplate
  };

  // Construct the full message content with images first, then text
  // Images first, then text for better processing
  const messageContent = [...imageContents, textContent];

  // Log the message content being sent to the API for debugging
  console.log('=== DEBUG: MESSAGE CONTENT SENT TO API ===');
  console.log(JSON.stringify(messageContent, null, 2));
  console.log('=== END DEBUG MESSAGE CONTENT ===');

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
        max_tokens: 1200,
        temperature: 1.0,
        system: "You generate entertaining daily summaries of Discord conversations for tech-focused servers as TechBro69. Your summary must include ALL the specified sections and maintain a sarcastic, blunt tone throughout.",
        messages: [
          {
            role: 'user',
            content: messageContent
          }
        ]
      }
    });

    // Extract the response content
    const summary = response.data.content[0].text;
    
    // Log the summary for debugging
    console.log('=== DEBUG: SUMMARY RECEIVED FROM API ===');
    console.log(summary);
    console.log('=== END DEBUG SUMMARY ===');
    
    return summary;
  } catch (error) {
    console.error('Error generating summary with Anthropic Claude:', error);
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    }
    throw error;
  }
}