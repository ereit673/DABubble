import { inject, Injectable } from '@angular/core';
import { MessagesService } from './messages.service';
import { BehaviorSubject, firstValueFrom, forkJoin, from, map } from 'rxjs';
import { Message, ThreadMessage } from '../../models/message';
import { AuthService } from './auth.service';
import { UserModel } from '../../models/user';
import { ChannelsService } from './channels.service';
import { Channel } from '../../models/channel';

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  messageService = inject(MessagesService);
  authService = inject(AuthService);
  channelService = inject(ChannelsService);

  private messageResultsSubject = new BehaviorSubject<any[]>([]);
  private threadMessageResultsSubject = new BehaviorSubject<any[]>([]);
  private userResultsSubject = new BehaviorSubject<any[]>([]);
  private channelResultsSubject = new BehaviorSubject<any[]>([]);
  private privateChannelResultsSubject = new BehaviorSubject<any[]>([]);
  messageResults$ = this.messageResultsSubject.asObservable();
  threadMessageResults$ = this.threadMessageResultsSubject.asObservable();
  userResults$ = this.userResultsSubject.asObservable();
  channelResults$ = this.channelResultsSubject.asObservable();
  privateChannelResults$ = this.privateChannelResultsSubject.asObservable();
  private allMessages: Message[] = [];
  private allThreadMessages: ThreadMessage[] = [];
  private allUsers: UserModel[] = [];
  private allChannels: Channel[] = [];
  public searchChannelsMessages: any = [];
  private messageResults: any[] = [];

  /**
   * Initializes the search service by loading all messages, thread messages, and channels from Firestore.
   * @param userId The ID of the user to load messages and thread messages for.
   */
  async initializeSearch(userId: string): Promise<void> {
    this.allChannels = await this.channelService.getAllChannels();
    this.allMessages = await firstValueFrom(
      this.messageService.getAllMessages()
    );
    this.allThreadMessages = await this.messageService.getAllThreadMessages();
  }

  /**
   * Loads all messages from the Firestore database for a given user.
   * When the messages are loaded, it stores them in the `allMessages` array.
   * It then calls the `getChannelName()` method to retrieve the channel names for the current message results.
   * @param userId - The ID of the user to load messages for.
   */
  public loadMessages(userId: string) {
    from(this.messageService.getAllMessages()).subscribe((messages) => {
      this.allMessages = Array.isArray(messages) ? messages : [];
      this.getChannelName();
    });
  }

  /**
   * Retrieves and updates the channel names for the current message results.
   *
   * This method subscribes to the `messageResults$` observable and processes the results
   * to fetch channel names based on the `channelId` of each message. It uses the `ChannelsService`
   * to retrieve the channel details and maps the channel names. The channel names are then
   * stored in the `searchChannelsMessages` array. If no messages are found, it clears the
   * `searchChannelsMessages` array.
   */
  getChannelName() {
    this.searchChannelsMessages = [];
    this.messageResults$.subscribe((results) => {
      this.messageResults = results;
      if (this.messageResults.length > 0) {
        const channelNames$ = this.messageResults
          .filter((element) => element.channelId)
          .map((element) =>
            from(this.channelService.getChannelById(element.channelId)).pipe(
              map((channel) => channel?.name || 'Unknown Channel')
            )
          );
        forkJoin(channelNames$).subscribe(
          (channelNames) => {
            this.searchChannelsMessages = channelNames.filter((name) => !!name);
          },
          (error) => {
            console.error('Error fetching channel names:', error);
          }
        );
      } else this.searchChannelsMessages = [];
    });
  }

  /**
   * Loads all thread messages for a given user from the Firestore database.
   * When the thread messages are loaded, it stores them in the `allThreadMessages` array.
   * @param {string} userId - The ID of the user to load thread messages for.
   */
  public loadThreadMessages(userId: string): void {
    from(this.messageService.getAllThreadMessagesForSearch(userId)).subscribe(
      (messages) => {
        this.allThreadMessages = Array.isArray(messages) ? messages : [];
      }
    );
  }

  /**
   * Loads all users from the Firestore database, excluding anonymous users and the current user.
   * When the users are loaded, it stores them in the `allUsers` array.
   * @param {string} userId - The ID of the current user to exclude from the results.
   */
  public loadUsers(userId: string): void {
    this.authService.getUserList().subscribe((users) => {
      this.allUsers = Array.isArray(users)
        ? users.filter(
            (user) => user.provider !== 'anonymous' && user.userId !== userId
          )
        : [];
    });
  }

  /**
   * Loads all channels from the Firestore database.
   * When the channels are loaded, it stores them in the `allChannels` array.
   * If the channels are loaded successfully, it logs a success message to the console.
   */
  public loadChannels(): void {
    from(this.channelService.getAllChannels()).subscribe((channels) => {
      this.allChannels = Array.isArray(channels) ? channels : [];
    });
  }

  /**
   * Searches for messages based on the search text.
   * If the search text is empty, it will return an empty array.
   * @param {string} searchText - The text to search for within messages.
   */
  searchMessages(searchText: string, userId: string): void {
    if (!searchText) {
      this.messageResultsSubject.next([]);
      return;
    }

    const filteredMessages = this.allMessages.filter((message) =>
      message.message.toLowerCase().includes(searchText.toLowerCase())
    );

    this.messageResultsSubject.next(filteredMessages);
  }

  /**
   * Searches for thread messages based on the search text.
   * If the search text is empty, it will return an empty array.
   * @param {string} searchText - The text to search for within thread messages.
   */
  searchThreadMessages(searchText: string, userId: string): void {
    if (!searchText) this.threadMessageResultsSubject.next([]);
    const filteredMessages = this.allThreadMessages.filter((message) =>
      message.message.toLowerCase().includes(searchText.toLowerCase())
    );
    this.threadMessageResultsSubject.next(filteredMessages);
  }

  /**
   * Searches for users based on the search text and type of search.
   * If the search text is empty, it will return all users.
   * @param {string} searchText - The text to search for within user names or emails.
   * @param {string} type - The type of search to perform; either 'name' to search user names or 'email' to search user emails.
   */
  searchUsers(searchText: string, type: string): void {
    if (!searchText.trim()) this.userResultsSubject.next(this.allUsers);
    const filteredUsers = this.allUsers.filter((user) => {
      if (type === 'name')
        return user.name.toLowerCase().includes(searchText.toLowerCase());
      else if (type === 'email')
        return user.email.toLowerCase().includes(searchText.toLowerCase());
      return false;
    });
    this.userResultsSubject.next(filteredUsers);
  }

  /**
   * Filters and updates the channel or private channel results based on the search text and user membership.
   * If the search text is empty, it will return all channels the user is a member of.
   * @param {string} searchText - The text to search for within channel names.
   * @param {string} userId - The ID of the user, used to filter channels the user is a member of.
   * @param {string} type - The type of channels to search for; either 'channel' for public channels or 'private' for private channels.
   */
  searchChannels(searchText: string, userId: string, type: string): void {
    if (searchText.trim()) {
      const filteredChannels = this.allChannels.filter(
        (channel) =>
          !channel.isPrivate &&
          channel.members.includes(userId) &&
          channel.name.toLowerCase().includes(searchText.toLowerCase())
      );
      this.channelResultsSubject.next(filteredChannels);
      return;
    }
  }

  /**
   * Searches for messages and thread messages based on the search text and user membership.
   * If the search text is empty, it will return empty arrays for both messages and thread messages.
   * @param {string} searchText - The text to search for within message and thread message bodies.
   * @param {string} userId - The ID of the user, used to filter messages and thread messages to those the user is a member of.
   */
  async searchMessagesAndThreads(
    searchText: string,
    userId: string
  ): Promise<void> {
    if (!searchText.trim()) {
      this.messageResultsSubject.next([]);
      this.threadMessageResultsSubject.next([]);
      return;
    }
    const userChannels = this.allChannels
      .filter((channel) => channel.members.includes(userId))
      .map((channel) => channel.id);
    const filteredMessages = this.allMessages.filter(
      (message) =>
        message.message.toLowerCase().includes(searchText.toLowerCase()) &&
        message.channelId &&
        userChannels.includes(message.channelId)
    );
    this.messageResultsSubject.next(filteredMessages);
    const filteredThreadMessages = this.allThreadMessages.filter(
      (threadMessage) =>
        threadMessage.message
          .toLowerCase()
          .includes(searchText.toLowerCase()) &&
        threadMessage.channelId &&
        userChannels.includes(threadMessage.channelId)
    );
    this.threadMessageResultsSubject.next(filteredThreadMessages);
  }
}
