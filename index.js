#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { BloggerOAuth } from './oauth.js';
import pkg from './package.json' with { type: 'json' };
const API_KEY = process.env.BLOGGER_API_KEY;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const DEFAULT_BLOG_ID = process.env.DEFAULT_BLOG_ID || '';
// Check for OAuth credentials for write operations
if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('⚠️  OAuth credentials missing. Write operations (create/update/delete posts) will be disabled.');
    console.error('To enable write operations, set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    console.error('Read operations will still work with BLOGGER_API_KEY.');
}
if (!API_KEY && (!CLIENT_ID || !CLIENT_SECRET)) {
    console.error('Either BLOGGER_API_KEY or OAuth credentials (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET) are required');
    process.exit(1);
}
const oauthHandler = CLIENT_ID && CLIENT_SECRET ? new BloggerOAuth() : null;
function resolveBlogId(args) {
    const blogId = args.blogId || DEFAULT_BLOG_ID;
    if (!blogId) {
        throw new McpError(ErrorCode.InvalidParams, 'blogId is required. Provide it as a parameter or set DEFAULT_BLOG_ID environment variable.');
    }
    return blogId;
}
class BloggerMCPServer {
    server;
    constructor() {
        this.server = new Server({
            name: 'blogger-mcp-server',
            version: pkg.version,
        }, {
            capabilities: {
                tools: {},
            },
        });
        this.setupToolHandlers();
        // Error handling
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }
    async getAuthClient(requireWrite = false) {
        if (requireWrite && oauthHandler) {
            // Use OAuth for write operations
            return await oauthHandler.getAuthenticatedClient();
        }
        else if (API_KEY) {
            // Use API key for read operations
            return API_KEY;
        }
        else {
            throw new Error('No authentication method available');
        }
    }
    getBloggerClient(auth) {
        return google.blogger({ version: 'v3', auth });
    }
    setupToolHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: 'list_blogs',
                        description: 'List all blogs for the authenticated user (OAuth required)',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                        },
                    },
                    {
                        name: 'get_blog_info',
                        description: 'Get information about a blog by URL or ID',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                blogUrl: {
                                    type: 'string',
                                    description: 'Blog URL (e.g., myblog.blogspot.com) or Blog ID',
                                },
                            },
                            required: ['blogUrl'],
                        },
                    },
                    {
                        name: 'list_posts',
                        description: 'List posts from a blog',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                blogId: {
                                    type: 'string',
                                    description: 'Blog ID (optional if DEFAULT_BLOG_ID is set)',
                                },
                                maxResults: {
                                    type: 'number',
                                    description: 'Maximum number of posts to return (default: 10)',
                                    default: 10,
                                },
                            },
                            required: [],
                        },
                    },
                    {
                        name: 'list_drafts',
                        description: 'List draft posts from a blog',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                blogId: {
                                    type: 'string',
                                    description: 'Blog ID (optional if DEFAULT_BLOG_ID is set)',
                                },
                                maxResults: {
                                    type: 'number',
                                    description: 'Maximum number of drafts to return (default: 10)',
                                    default: 10,
                                },
                            },
                            required: [],
                        },
                    },
                    {
                        name: 'get_post',
                        description: 'Get a specific post by ID',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                blogId: {
                                    type: 'string',
                                    description: 'Blog ID (optional if DEFAULT_BLOG_ID is set)',
                                },
                                postId: {
                                    type: 'string',
                                    description: 'Post ID',
                                },
                            },
                            required: ['postId'],
                        },
                    },
                    {
                        name: 'search_posts',
                        description: 'Search for posts in a blog',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                blogId: {
                                    type: 'string',
                                    description: 'Blog ID (optional if DEFAULT_BLOG_ID is set)',
                                },
                                query: {
                                    type: 'string',
                                    description: 'Search query',
                                },
                            },
                            required: ['query'],
                        },
                    },
                    {
                        name: 'create_post',
                        description: 'Create a new blog post',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                blogId: {
                                    type: 'string',
                                    description: 'Blog ID (optional if DEFAULT_BLOG_ID is set)',
                                },
                                title: {
                                    type: 'string',
                                    description: 'Post title',
                                },
                                content: {
                                    type: 'string',
                                    description: 'Post content (HTML allowed). For content larger than 10KB, use content_file instead to avoid parameter size limits.',
                                },
                                content_file: {
                                    type: 'string',
                                    description: 'Path to a file containing post content (HTML). Recommended for large posts. Takes precedence over content if both are provided.',
                                },
                                labels: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Post labels/tags (optional)',
                                },
                                isDraft: {
                                    type: 'boolean',
                                    description: 'Whether to create as draft (default: true)',
                                    default: true,
                                },
                            },
                            required: ['title'],
                        },
                    },
                    {
                        name: 'update_post',
                        description: 'Update an existing blog post',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                blogId: {
                                    type: 'string',
                                    description: 'Blog ID (optional if DEFAULT_BLOG_ID is set)',
                                },
                                postId: {
                                    type: 'string',
                                    description: 'Post ID',
                                },
                                title: {
                                    type: 'string',
                                    description: 'New post title (optional)',
                                },
                                content: {
                                    type: 'string',
                                    description: 'New post content (HTML allowed, optional). For content larger than 10KB, use content_file instead to avoid parameter size limits.',
                                },
                                content_file: {
                                    type: 'string',
                                    description: 'Path to a file containing new post content (HTML). Recommended for large posts. Takes precedence over content if both are provided.',
                                },
                                labels: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'New post labels/tags (optional)',
                                },
                            },
                            required: ['postId'],
                        },
                    },
                    {
                        name: 'change_post_status',
                        description: 'Publish a draft post or revert a published post to draft',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                blogId: {
                                    type: 'string',
                                    description: 'Blog ID (optional if DEFAULT_BLOG_ID is set)',
                                },
                                postId: {
                                    type: 'string',
                                    description: 'Post ID',
                                },
                                action: {
                                    type: 'string',
                                    enum: ['publish', 'revert'],
                                    description: 'Action to perform: "publish" to publish a draft, "revert" to revert a published post to draft',
                                },
                            },
                            required: ['postId', 'action'],
                        },
                    },
                    {
                        name: 'delete_post',
                        description: 'Delete a blog post',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                blogId: {
                                    type: 'string',
                                    description: 'Blog ID (optional if DEFAULT_BLOG_ID is set)',
                                },
                                postId: {
                                    type: 'string',
                                    description: 'Post ID',
                                },
                            },
                            required: ['postId'],
                        },
                    },
                ],
            };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            if (!args) {
                throw new McpError(ErrorCode.InvalidParams, 'Arguments are required');
            }
            try {
                switch (name) {
                    case 'list_blogs':
                        return await this.listBlogs();
                    case 'get_blog_info':
                        return await this.getBlogInfo(args.blogUrl);
                    case 'list_posts':
                        return await this.listPosts(resolveBlogId(args), args.maxResults || 10);
                    case 'list_drafts':
                        return await this.listDrafts(resolveBlogId(args), args.maxResults || 10);
                    case 'get_post':
                        return await this.getPost(resolveBlogId(args), args.postId);
                    case 'search_posts':
                        return await this.searchPosts(resolveBlogId(args), args.query);
                    case 'create_post': {
                        let content = args.content_file ? readFileSync(args.content_file, 'utf8') : args.content;
                        if (!content) throw new McpError(ErrorCode.InvalidParams, 'Either content or content_file is required');
                        return await this.createPost(resolveBlogId(args), args.title, content, args.labels || [], args.isDraft !== false);
                    }
                    case 'update_post': {
                        let updateContent = args.content_file ? readFileSync(args.content_file, 'utf8') : args.content;
                        return await this.updatePost(resolveBlogId(args), args.postId, args.title, updateContent, args.labels);
                    }
                    case 'change_post_status':
                        return await this.changePostStatus(resolveBlogId(args), args.postId, args.action);
                    case 'delete_post':
                        return await this.deletePost(resolveBlogId(args), args.postId);
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${errorMessage}`);
            }
        });
    }
    async listBlogs() {
        try {
            if (!oauthHandler) {
                throw new Error('OAuth authentication required for listing blogs. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
            }
            const auth = await this.getAuthClient(true);
            const bloggerClient = this.getBloggerClient(auth);
            const response = await bloggerClient.blogs.listByUser({
                userId: 'self',
            });
            const blogs = response.data.items || [];
            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${blogs.length} blog(s):\n\n` +
                            (blogs.length > 0
                                ? blogs.map(blog => `**${blog.name}**\n` +
                                    `ID: ${blog.id}\n` +
                                    `URL: ${blog.url}\n` +
                                    `---`).join('\n\n')
                                : 'No blogs found.'),
                    },
                ],
            };
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to list blogs: ${error}`);
        }
    }
    async getBlogInfo(blogUrl) {
        try {
            const auth = await this.getAuthClient(false); // Read operation
            const bloggerClient = this.getBloggerClient(auth);
            let response;
            // Check if it's a URL or ID
            if (blogUrl.includes('.')) {
                // It's a URL
                response = await bloggerClient.blogs.getByUrl({
                    url: blogUrl.startsWith('http') ? blogUrl : `https://${blogUrl}`,
                });
            }
            else {
                // It's an ID
                response = await bloggerClient.blogs.get({
                    blogId: blogUrl,
                });
            }
            const blog = response.data;
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            id: blog.id,
                            name: blog.name,
                            description: blog.description,
                            url: blog.url,
                            published: blog.published,
                            updated: blog.updated,
                            posts: {
                                totalItems: blog.posts?.totalItems || 0,
                            },
                            pages: {
                                totalItems: blog.pages?.totalItems || 0,
                            },
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to get blog info: ${error}`);
        }
    }
    async listPosts(blogId, maxResults) {
        try {
            const auth = await this.getAuthClient(false); // Read operation
            const bloggerClient = this.getBloggerClient(auth);
            const response = await bloggerClient.posts.list({
                blogId,
                maxResults,
            });
            const posts = response.data.items || [];
            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${posts.length} posts:\n\n` +
                            posts.map(post => `**${post.title}**\n` +
                                `ID: ${post.id}\n` +
                                `Published: ${post.published}\n` +
                                `URL: ${post.url}\n` +
                                `---`).join('\n\n'),
                    },
                ],
            };
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to list posts: ${error}`);
        }
    }
    async listDrafts(blogId, maxResults) {
        try {
            if (!oauthHandler) {
                throw new Error('OAuth authentication required for listing drafts. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
            }
            const auth = await this.getAuthClient(true); // Requires OAuth
            const bloggerClient = this.getBloggerClient(auth);
            const response = await bloggerClient.posts.list({
                blogId,
                maxResults,
                status: 'draft',
            });
            const drafts = response.data.items || [];
            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${drafts.length} draft(s):\n\n` +
                            (drafts.length > 0 
                                ? drafts.map(post => `**${post.title}**\n` +
                                    `ID: ${post.id}\n` +
                                    `Created: ${post.published || 'N/A'}\n` +
                                    `Updated: ${post.updated}\n` +
                                    `---`).join('\n\n')
                                : 'No drafts found.'),
                    },
                ],
            };
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to list drafts: ${error}`);
        }
    }
    async getPost(blogId, postId) {
        try {
            const useOAuth = !!oauthHandler;
            const auth = await this.getAuthClient(useOAuth);
            const bloggerClient = this.getBloggerClient(auth);
            const params = { blogId, postId };
            if (useOAuth) {
                params.view = 'ADMIN';
            }
            const response = await bloggerClient.posts.get(params);
            const post = response.data;
            const status = post.status || 'LIVE';
            return {
                content: [
                    {
                        type: 'text',
                        text: `**${post.title}**\n\n` +
                            `Status: ${status}\n` +
                            `Published: ${post.published || 'N/A'}\n` +
                            `Updated: ${post.updated}\n` +
                            `URL: ${post.url || 'N/A (draft)'}\n\n` +
                            `**Content:**\n${post.content}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to get post: ${error}`);
        }
    }
    async searchPosts(blogId, query) {
        try {
            const auth = await this.getAuthClient(false); // Read operation
            const bloggerClient = this.getBloggerClient(auth);
            const response = await bloggerClient.posts.search({
                blogId,
                q: query,
            });
            const posts = response.data.items || [];
            return {
                content: [
                    {
                        type: 'text',
                        text: `Found ${posts.length} posts matching "${query}":\n\n` +
                            posts.map(post => `**${post.title}**\n` +
                                `ID: ${post.id}\n` +
                                `Published: ${post.published}\n` +
                                `URL: ${post.url}\n` +
                                `---`).join('\n\n'),
                    },
                ],
            };
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to search posts: ${error}`);
        }
    }
    async createPost(blogId, title, content, labels = [], isDraft = false) {
        try {
            if (!oauthHandler) {
                throw new Error('OAuth authentication required for creating posts. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
            }
            const auth = await this.getAuthClient(true); // Write operation requires OAuth
            const bloggerClient = this.getBloggerClient(auth);
            const post = {
                kind: 'blogger#post',
                title,
                content,
                labels,
            };
            // Use the correct API pattern for drafts
            if (isDraft) {
                const response = await bloggerClient.posts.insert({
                    blogId,
                    requestBody: post,
                    isDraft: true,
                });
                const createdPost = response.data;
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully created draft: **${createdPost.title}**\n\n` +
                                `Post ID: ${createdPost.id}\n` +
                                `Status: Draft\n` +
                                `Created: ${createdPost.published || 'Draft (not published)'}`,
                        },
                    ],
                };
            }
            else {
                const response = await bloggerClient.posts.insert({
                    blogId,
                    requestBody: post,
                });
                const createdPost = response.data;
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully created post: **${createdPost.title}**\n\n` +
                                `Post ID: ${createdPost.id}\n` +
                                `URL: ${createdPost.url}\n` +
                                `Published: ${createdPost.published}`,
                        },
                    ],
                };
            }
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to create post: ${error}`);
        }
    }
    async updatePost(blogId, postId, title, content, labels) {
        try {
            if (!oauthHandler) {
                throw new Error('OAuth authentication required for updating posts. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
            }
            const auth = await this.getAuthClient(true);
            const bloggerClient = this.getBloggerClient(auth);
            // Fetch the existing post with ADMIN view to support both live and draft posts
            const existing = await bloggerClient.posts.get({
                blogId,
                postId,
                view: 'ADMIN',
            });
            const postData = existing.data;
            // Merge updates into the existing post
            if (title)
                postData.title = title;
            if (content)
                postData.content = content;
            if (labels)
                postData.labels = labels;
            const response = await bloggerClient.posts.update({
                blogId,
                postId,
                requestBody: postData,
            });
            const updatedPost = response.data;
            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully updated post: **${updatedPost.title}**\n\n` +
                            `Post ID: ${updatedPost.id}\n` +
                            `Status: ${updatedPost.status || 'LIVE'}\n` +
                            `URL: ${updatedPost.url || 'N/A (draft)'}\n` +
                            `Last Updated: ${updatedPost.updated}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to update post: ${error}`);
        }
    }
    async changePostStatus(blogId, postId, action) {
        try {
            if (!oauthHandler) {
                throw new Error('OAuth authentication required. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
            }
            const auth = await this.getAuthClient(true);
            const bloggerClient = this.getBloggerClient(auth);
            if (action === 'publish') {
                const response = await bloggerClient.posts.publish({
                    blogId,
                    postId,
                });
                const post = response.data;
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully published: **${post.title}**\n\n` +
                                `Post ID: ${post.id}\n` +
                                `URL: ${post.url}\n` +
                                `Published: ${post.published}`,
                        },
                    ],
                };
            }
            else if (action === 'revert') {
                const response = await bloggerClient.posts.revert({
                    blogId,
                    postId,
                });
                const post = response.data;
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully reverted to draft: **${post.title}**\n\n` +
                                `Post ID: ${post.id}\n` +
                                `Status: Draft`,
                        },
                    ],
                };
            }
            else {
                throw new McpError(ErrorCode.InvalidParams, 'action must be "publish" or "revert"');
            }
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to ${action} post: ${error}`);
        }
    }
    async deletePost(blogId, postId) {
        try {
            if (!oauthHandler) {
                throw new Error('OAuth authentication required for deleting posts. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
            }
            const auth = await this.getAuthClient(true); // Write operation requires OAuth
            const bloggerClient = this.getBloggerClient(auth);
            await bloggerClient.posts.delete({
                blogId,
                postId,
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully deleted post with ID: ${postId}`,
                    },
                ],
            };
        }
        catch (error) {
            throw new McpError(ErrorCode.InternalError, `Failed to delete post: ${error}`);
        }
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}
const server = new BloggerMCPServer();
server.run().catch(console.error);
