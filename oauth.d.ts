export declare class BloggerOAuth {
    private oauth2Client;
    private config;
    private tokenFile;
    constructor();
    getAuthenticatedClient(): Promise<any>;
    private performOAuthFlow;
    private saveTokens;
    revokeAuth(): Promise<void>;
}
