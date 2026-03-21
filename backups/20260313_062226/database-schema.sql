-- accounting_books
CREATE TABLE `accounting_books` (
  `id` varchar(191) NOT NULL,
  `organizationId` varchar(191) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `description` varchar(191) DEFAULT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'open',
  `currency` varchar(191) NOT NULL DEFAULT 'USD',
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `accounting_books_organizationId_fkey` (`organizationId`),
  CONSTRAINT `accounting_books_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- accounting_contracts
CREATE TABLE `accounting_contracts` (
  `id` varchar(191) NOT NULL,
  `bookId` varchar(191) NOT NULL,
  `number` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `currency` varchar(191) NOT NULL DEFAULT 'USD',
  `status` varchar(191) NOT NULL DEFAULT 'active',
  `signedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `accounting_contracts_bookId_fkey` (`bookId`),
  CONSTRAINT `accounting_contracts_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `accounting_books` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- accounting_transactions
CREATE TABLE `accounting_transactions` (
  `id` varchar(191) NOT NULL,
  `contractId` varchar(191) NOT NULL,
  `type` varchar(191) NOT NULL DEFAULT 'credit',
  `amount` decimal(15,2) NOT NULL,
  `description` varchar(191) DEFAULT NULL,
  `date` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `accounting_transactions_contractId_fkey` (`contractId`),
  CONSTRAINT `accounting_transactions_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `accounting_contracts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- accounts
CREATE TABLE `accounts` (
  `id` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `type` varchar(191) NOT NULL,
  `provider` varchar(191) NOT NULL,
  `providerAccountId` varchar(191) NOT NULL,
  `refresh_token` text DEFAULT NULL,
  `access_token` text DEFAULT NULL,
  `expires_at` int(11) DEFAULT NULL,
  `token_type` varchar(191) DEFAULT NULL,
  `scope` varchar(191) DEFAULT NULL,
  `id_token` text DEFAULT NULL,
  `session_state` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `accounts_provider_providerAccountId_key` (`provider`,`providerAccountId`),
  KEY `accounts_userId_fkey` (`userId`),
  CONSTRAINT `accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- attachments
CREATE TABLE `attachments` (
  `id` varchar(191) NOT NULL,
  `fileName` varchar(191) NOT NULL,
  `fileUrl` varchar(191) NOT NULL,
  `fileSize` int(11) NOT NULL,
  `mimeType` varchar(191) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `taskId` varchar(191) DEFAULT NULL,
  `documentId` varchar(191) DEFAULT NULL,
  `emailId` varchar(191) DEFAULT NULL,
  `serviceDeskRequestId` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `attachments_taskId_fkey` (`taskId`),
  KEY `attachments_documentId_fkey` (`documentId`),
  KEY `attachments_emailId_fkey` (`emailId`),
  KEY `attachments_serviceDeskRequestId_fkey` (`serviceDeskRequestId`),
  CONSTRAINT `attachments_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `attachments_emailId_fkey` FOREIGN KEY (`emailId`) REFERENCES `emails` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `attachments_serviceDeskRequestId_fkey` FOREIGN KEY (`serviceDeskRequestId`) REFERENCES `servicedesk_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `attachments_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- audit_logs
CREATE TABLE `audit_logs` (
  `id` varchar(191) NOT NULL,
  `userId` varchar(191) DEFAULT NULL,
  `action` varchar(191) NOT NULL,
  `module` varchar(191) NOT NULL,
  `targetId` varchar(191) DEFAULT NULL,
  `details` text DEFAULT NULL,
  `ipAddress` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- bank_accounts
CREATE TABLE `bank_accounts` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `accountNumber` varchar(191) NOT NULL,
  `bankName` varchar(191) NOT NULL,
  `currency` varchar(191) NOT NULL DEFAULT 'USD',
  `provider` varchar(191) NOT NULL DEFAULT 'manual',
  `balance` decimal(15,2) NOT NULL DEFAULT 0.00,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- bank_routing_rules
CREATE TABLE `bank_routing_rules` (
  `id` varchar(191) NOT NULL,
  `accountId` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `condition` text NOT NULL,
  `action` text NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `bank_routing_rules_accountId_fkey` (`accountId`),
  CONSTRAINT `bank_routing_rules_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `bank_accounts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- bank_transactions
CREATE TABLE `bank_transactions` (
  `id` varchar(191) NOT NULL,
  `accountId` varchar(191) NOT NULL,
  `type` varchar(191) NOT NULL DEFAULT 'credit',
  `amount` decimal(15,2) NOT NULL,
  `currency` varchar(191) NOT NULL DEFAULT 'USD',
  `description` varchar(191) DEFAULT NULL,
  `reference` varchar(191) DEFAULT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'recognized',
  `transactionAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `bank_transactions_accountId_fkey` (`accountId`),
  CONSTRAINT `bank_transactions_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `bank_accounts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- board_categories
CREATE TABLE `board_categories` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `color` varchar(191) NOT NULL DEFAULT '#FE0000',
  `description` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- board_posts
CREATE TABLE `board_posts` (
  `id` varchar(191) NOT NULL,
  `topicId` varchar(191) NOT NULL,
  `authorId` varchar(191) NOT NULL,
  `content` text NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `board_posts_topicId_fkey` (`topicId`),
  KEY `board_posts_authorId_fkey` (`authorId`),
  CONSTRAINT `board_posts_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `users` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `board_posts_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `board_topics` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- board_topics
CREATE TABLE `board_topics` (
  `id` varchar(191) NOT NULL,
  `categoryId` varchar(191) NOT NULL,
  `creatorId` varchar(191) NOT NULL,
  `title` varchar(191) NOT NULL,
  `isPinned` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  `description` text DEFAULT NULL,
  `isLocked` tinyint(1) NOT NULL DEFAULT 0,
  `isResolved` tinyint(1) NOT NULL DEFAULT 0,
  `lastActivityAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `organizationId` varchar(191) DEFAULT NULL,
  `resolvedAt` datetime(3) DEFAULT NULL,
  `resolvedById` varchar(191) DEFAULT NULL,
  `teamId` varchar(191) DEFAULT NULL,
  `visibility` varchar(191) NOT NULL DEFAULT 'organization',
  PRIMARY KEY (`id`),
  KEY `board_topics_categoryId_updatedAt_idx` (`categoryId`,`updatedAt`),
  KEY `board_topics_visibility_teamId_organizationId_idx` (`visibility`,`teamId`,`organizationId`),
  KEY `board_topics_creatorId_updatedAt_idx` (`creatorId`,`updatedAt`),
  KEY `board_topics_resolvedById_fkey` (`resolvedById`),
  KEY `board_topics_teamId_fkey` (`teamId`),
  KEY `board_topics_organizationId_fkey` (`organizationId`),
  CONSTRAINT `board_topics_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `board_categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `board_topics_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `board_topics_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `board_topics_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `board_topics_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- calendars
CREATE TABLE `calendars` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `type` varchar(191) NOT NULL DEFAULT 'personal',
  `color` varchar(191) NOT NULL DEFAULT '#437388',
  `ownerId` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- calendar_events
CREATE TABLE `calendar_events` (
  `id` varchar(191) NOT NULL,
  `calendarId` varchar(191) NOT NULL,
  `creatorId` varchar(191) NOT NULL,
  `title` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `startDate` datetime(3) NOT NULL,
  `endDate` datetime(3) NOT NULL,
  `allDay` tinyint(1) NOT NULL DEFAULT 0,
  `location` varchar(191) DEFAULT NULL,
  `color` varchar(191) DEFAULT NULL,
  `isRecurring` tinyint(1) NOT NULL DEFAULT 0,
  `recurRule` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `calendar_events_calendarId_fkey` (`calendarId`),
  KEY `calendar_events_creatorId_fkey` (`creatorId`),
  CONSTRAINT `calendar_events_calendarId_fkey` FOREIGN KEY (`calendarId`) REFERENCES `calendars` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `calendar_events_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- calendar_members
CREATE TABLE `calendar_members` (
  `id` varchar(191) NOT NULL,
  `calendarId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `canEdit` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `calendar_members_calendarId_userId_key` (`calendarId`,`userId`),
  KEY `calendar_members_userId_fkey` (`userId`),
  CONSTRAINT `calendar_members_calendarId_fkey` FOREIGN KEY (`calendarId`) REFERENCES `calendars` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `calendar_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- call_logs
CREATE TABLE `call_logs` (
  `id` varchar(191) NOT NULL,
  `callerId` varchar(191) DEFAULT NULL,
  `callerNum` varchar(191) NOT NULL,
  `calleeNum` varchar(191) NOT NULL,
  `calleeId` varchar(191) DEFAULT NULL,
  `direction` varchar(191) NOT NULL DEFAULT 'inbound',
  `status` varchar(191) NOT NULL DEFAULT 'answered',
  `duration` int(11) NOT NULL DEFAULT 0,
  `startedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `endedAt` datetime(3) DEFAULT NULL,
  `recordUrl` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- chat_dialogs
CREATE TABLE `chat_dialogs` (
  `id` varchar(191) NOT NULL,
  `subject` varchar(191) DEFAULT NULL,
  `groupId` varchar(191) DEFAULT NULL,
  `organizationId` varchar(191) DEFAULT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'open',
  `isExternal` tinyint(1) NOT NULL DEFAULT 0,
  `visitorName` varchar(191) DEFAULT NULL,
  `visitorEmail` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `chat_dialogs_groupId_fkey` (`groupId`),
  KEY `chat_dialogs_organizationId_fkey` (`organizationId`),
  CONSTRAINT `chat_dialogs_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `chat_service_groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chat_dialogs_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- chat_dialog_members
CREATE TABLE `chat_dialog_members` (
  `id` varchar(191) NOT NULL,
  `dialogId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `chat_dialog_members_dialogId_userId_key` (`dialogId`,`userId`),
  KEY `chat_dialog_members_userId_fkey` (`userId`),
  CONSTRAINT `chat_dialog_members_dialogId_fkey` FOREIGN KEY (`dialogId`) REFERENCES `chat_dialogs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chat_dialog_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- chat_messages
CREATE TABLE `chat_messages` (
  `id` varchar(191) NOT NULL,
  `dialogId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `content` text NOT NULL,
  `isSystem` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `chat_messages_dialogId_fkey` (`dialogId`),
  KEY `chat_messages_userId_fkey` (`userId`),
  CONSTRAINT `chat_messages_dialogId_fkey` FOREIGN KEY (`dialogId`) REFERENCES `chat_dialogs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chat_messages_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- chat_service_groups
CREATE TABLE `chat_service_groups` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `description` varchar(191) DEFAULT NULL,
  `isPublic` tinyint(1) NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- contacts
CREATE TABLE `contacts` (
  `id` varchar(191) NOT NULL,
  `organizationId` varchar(191) DEFAULT NULL,
  `createdById` varchar(191) NOT NULL,
  `firstName` varchar(191) NOT NULL,
  `lastName` varchar(191) NOT NULL,
  `email` varchar(191) DEFAULT NULL,
  `phone` varchar(191) DEFAULT NULL,
  `mobile` varchar(191) DEFAULT NULL,
  `position` varchar(191) DEFAULT NULL,
  `department` varchar(191) DEFAULT NULL,
  `website` varchar(191) DEFAULT NULL,
  `country` varchar(191) DEFAULT NULL,
  `city` varchar(191) DEFAULT NULL,
  `address` varchar(191) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `photoUrl` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `contacts_organizationId_fkey` (`organizationId`),
  KEY `contacts_createdById_fkey` (`createdById`),
  CONSTRAINT `contacts_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `contacts_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- departments
CREATE TABLE `departments` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `parentId` varchar(191) DEFAULT NULL,
  `managerId` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- documents
CREATE TABLE `documents` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `content` longtext DEFAULT NULL,
  `fileUrl` varchar(191) DEFAULT NULL,
  `fileSize` int(11) DEFAULT NULL,
  `mimeType` varchar(191) DEFAULT NULL,
  `folderId` varchar(191) DEFAULT NULL,
  `ownerId` varchar(191) NOT NULL,
  `isSigned` tinyint(1) NOT NULL DEFAULT 0,
  `signedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  `accessLevel` varchar(191) NOT NULL DEFAULT 'module',
  PRIMARY KEY (`id`),
  KEY `documents_folderId_fkey` (`folderId`),
  KEY `documents_ownerId_fkey` (`ownerId`),
  CONSTRAINT `documents_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `document_folders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `documents_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- document_folders
CREATE TABLE `document_folders` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `parentId` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  `accessLevel` varchar(191) NOT NULL DEFAULT 'module',
  `ownerId` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `document_folders_parentId_fkey` (`parentId`),
  KEY `document_folders_ownerId_fkey` (`ownerId`),
  CONSTRAINT `document_folders_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `document_folders_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `document_folders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- document_folder_shares
CREATE TABLE `document_folder_shares` (
  `id` varchar(191) NOT NULL,
  `folderId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `canRead` tinyint(1) NOT NULL DEFAULT 1,
  `canWrite` tinyint(1) NOT NULL DEFAULT 0,
  `canDelete` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `document_folder_shares_folderId_userId_key` (`folderId`,`userId`),
  KEY `document_folder_shares_userId_idx` (`userId`),
  CONSTRAINT `document_folder_shares_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `document_folders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `document_folder_shares_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- document_shares
CREATE TABLE `document_shares` (
  `id` varchar(191) NOT NULL,
  `documentId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `canRead` tinyint(1) NOT NULL DEFAULT 1,
  `canWrite` tinyint(1) NOT NULL DEFAULT 0,
  `canDelete` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `document_shares_documentId_userId_key` (`documentId`,`userId`),
  KEY `document_shares_userId_idx` (`userId`),
  CONSTRAINT `document_shares_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `documents` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `document_shares_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- emails
CREATE TABLE `emails` (
  `id` varchar(191) NOT NULL,
  `subject` varchar(191) NOT NULL,
  `body` longtext NOT NULL,
  `fromId` varchar(191) DEFAULT NULL,
  `mailboxId` varchar(191) DEFAULT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'inbox',
  `isRead` tinyint(1) NOT NULL DEFAULT 0,
  `isStarred` tinyint(1) NOT NULL DEFAULT 0,
  `parentId` varchar(191) DEFAULT NULL,
  `threadId` varchar(191) DEFAULT NULL,
  `organizationId` varchar(191) DEFAULT NULL,
  `sentAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `messageId` varchar(191) DEFAULT NULL,
  `senderEmail` varchar(191) DEFAULT NULL,
  `senderName` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `emails_organizationId_fkey` (`organizationId`),
  KEY `emails_mailboxId_messageId_idx` (`mailboxId`,`messageId`),
  KEY `emails_fromId_fkey` (`fromId`),
  CONSTRAINT `emails_fromId_fkey` FOREIGN KEY (`fromId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `emails_mailboxId_fkey` FOREIGN KEY (`mailboxId`) REFERENCES `mailboxes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `emails_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- email_recipients
CREATE TABLE `email_recipients` (
  `id` varchar(191) NOT NULL,
  `emailId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `type` varchar(191) NOT NULL DEFAULT 'to',
  PRIMARY KEY (`id`),
  KEY `email_recipients_emailId_fkey` (`emailId`),
  KEY `email_recipients_userId_fkey` (`userId`),
  CONSTRAINT `email_recipients_emailId_fkey` FOREIGN KEY (`emailId`) REFERENCES `emails` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `email_recipients_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- extensions
CREATE TABLE `extensions` (
  `id` varchar(191) NOT NULL,
  `userId` varchar(191) DEFAULT NULL,
  `number` varchar(191) NOT NULL,
  `password` varchar(191) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `extensions_number_key` (`number`),
  UNIQUE KEY `extensions_userId_key` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- groups
CREATE TABLE `groups` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `description` varchar(191) DEFAULT NULL,
  `color` varchar(191) NOT NULL DEFAULT '#3B4A61',
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- group_members
CREATE TABLE `group_members` (
  `id` varchar(191) NOT NULL,
  `groupId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `role` varchar(191) NOT NULL DEFAULT 'member',
  PRIMARY KEY (`id`),
  UNIQUE KEY `group_members_groupId_userId_key` (`groupId`,`userId`),
  KEY `group_members_userId_fkey` (`userId`),
  CONSTRAINT `group_members_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `group_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- mailboxes
CREATE TABLE `mailboxes` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `email` varchar(191) NOT NULL,
  `imapHost` varchar(191) NOT NULL,
  `imapPort` int(11) NOT NULL DEFAULT 993,
  `smtpHost` varchar(191) NOT NULL,
  `smtpPort` int(11) NOT NULL DEFAULT 587,
  `username` varchar(191) NOT NULL,
  `password` varchar(191) NOT NULL,
  `useSSL` tinyint(1) NOT NULL DEFAULT 1,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `lastSync` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `mailboxes_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- notifications
CREATE TABLE `notifications` (
  `id` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `type` varchar(191) NOT NULL,
  `title` varchar(191) NOT NULL,
  `body` varchar(191) DEFAULT NULL,
  `link` varchar(191) DEFAULT NULL,
  `isRead` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `notifications_userId_fkey` (`userId`),
  CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- organizations
CREATE TABLE `organizations` (
  `id` varchar(191) NOT NULL,
  `cid` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `type` varchar(191) NOT NULL DEFAULT 'potential',
  `status` varchar(191) NOT NULL DEFAULT 'open',
  `rating` varchar(191) NOT NULL DEFAULT 'weak',
  `industry` varchar(191) DEFAULT NULL,
  `leadSource` varchar(191) DEFAULT NULL,
  `slaId` varchar(191) DEFAULT NULL,
  `managerId` varchar(191) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `website` varchar(191) DEFAULT NULL,
  `phone` varchar(191) DEFAULT NULL,
  `fax` varchar(191) DEFAULT NULL,
  `country` varchar(191) DEFAULT NULL,
  `region` varchar(191) DEFAULT NULL,
  `city` varchar(191) DEFAULT NULL,
  `address` varchar(191) DEFAULT NULL,
  `postalIndex` varchar(191) DEFAULT NULL,
  `timezone` varchar(191) DEFAULT NULL,
  `regAddress` varchar(191) DEFAULT NULL,
  `bankAccount` varchar(191) DEFAULT NULL,
  `comment` text DEFAULT NULL,
  `logoUrl` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `organizations_cid_key` (`cid`),
  KEY `organizations_slaId_fkey` (`slaId`),
  KEY `organizations_managerId_fkey` (`managerId`),
  CONSTRAINT `organizations_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `organizations_slaId_fkey` FOREIGN KEY (`slaId`) REFERENCES `slas` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- org_custom_fields
CREATE TABLE `org_custom_fields` (
  `id` varchar(191) NOT NULL,
  `organizationId` varchar(191) NOT NULL,
  `fieldName` varchar(191) NOT NULL,
  `fieldValue` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `org_custom_fields_organizationId_fkey` (`organizationId`),
  CONSTRAINT `org_custom_fields_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- org_documents
CREATE TABLE `org_documents` (
  `id` varchar(191) NOT NULL,
  `organizationId` varchar(191) NOT NULL,
  `documentId` varchar(191) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `org_documents_organizationId_fkey` (`organizationId`),
  CONSTRAINT `org_documents_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- org_history
CREATE TABLE `org_history` (
  `id` varchar(191) NOT NULL,
  `organizationId` varchar(191) NOT NULL,
  `userId` varchar(191) DEFAULT NULL,
  `content` text NOT NULL,
  `isSystem` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `org_history_organizationId_fkey` (`organizationId`),
  CONSTRAINT `org_history_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- products
CREATE TABLE `products` (
  `id` varchar(191) NOT NULL,
  `categoryId` varchar(191) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `price` decimal(15,2) NOT NULL DEFAULT 0.00,
  `currency` varchar(191) NOT NULL DEFAULT 'USD',
  `sku` varchar(191) DEFAULT NULL,
  `stock` int(11) NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `products_categoryId_fkey` (`categoryId`),
  CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `product_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- product_categories
CREATE TABLE `product_categories` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- projects
CREATE TABLE `projects` (
  `id` varchar(191) NOT NULL,
  `categoryId` varchar(191) DEFAULT NULL,
  `name` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'active',
  `startDate` datetime(3) DEFAULT NULL,
  `endDate` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `projects_categoryId_fkey` (`categoryId`),
  CONSTRAINT `projects_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `project_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- project_categories
CREATE TABLE `project_categories` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- project_members
CREATE TABLE `project_members` (
  `id` varchar(191) NOT NULL,
  `projectId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `role` varchar(191) NOT NULL DEFAULT 'member',
  PRIMARY KEY (`id`),
  UNIQUE KEY `project_members_projectId_userId_key` (`projectId`,`userId`),
  KEY `project_members_userId_fkey` (`userId`),
  CONSTRAINT `project_members_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `project_members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- project_phases
CREATE TABLE `project_phases` (
  `id` varchar(191) NOT NULL,
  `projectId` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `order` int(11) NOT NULL DEFAULT 0,
  `startDate` datetime(3) DEFAULT NULL,
  `endDate` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `project_phases_projectId_fkey` (`projectId`),
  CONSTRAINT `project_phases_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- project_tasks
CREATE TABLE `project_tasks` (
  `id` varchar(191) NOT NULL,
  `projectId` varchar(191) NOT NULL,
  `phaseId` varchar(191) DEFAULT NULL,
  `assigneeId` varchar(191) DEFAULT NULL,
  `title` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'todo',
  `priority` varchar(191) NOT NULL DEFAULT 'normal',
  `dueDate` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `project_tasks_projectId_fkey` (`projectId`),
  KEY `project_tasks_phaseId_fkey` (`phaseId`),
  KEY `project_tasks_assigneeId_fkey` (`assigneeId`),
  CONSTRAINT `project_tasks_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `project_tasks_phaseId_fkey` FOREIGN KEY (`phaseId`) REFERENCES `project_phases` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `project_tasks_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- servicedesk_categories
CREATE TABLE `servicedesk_categories` (
  `id` varchar(191) NOT NULL,
  `groupId` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `servicedesk_categories_groupId_fkey` (`groupId`),
  CONSTRAINT `servicedesk_categories_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `servicedesk_groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- servicedesk_comments
CREATE TABLE `servicedesk_comments` (
  `id` varchar(191) NOT NULL,
  `requestId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `content` text NOT NULL,
  `isSystem` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `servicedesk_comments_requestId_fkey` (`requestId`),
  KEY `servicedesk_comments_userId_fkey` (`userId`),
  CONSTRAINT `servicedesk_comments_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `servicedesk_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `servicedesk_comments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- servicedesk_groups
CREATE TABLE `servicedesk_groups` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `description` varchar(191) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- servicedesk_requests
CREATE TABLE `servicedesk_requests` (
  `id` varchar(191) NOT NULL,
  `groupId` varchar(191) NOT NULL,
  `categoryId` varchar(191) DEFAULT NULL,
  `requesterId` varchar(191) NOT NULL,
  `assigneeId` varchar(191) DEFAULT NULL,
  `organizationId` varchar(191) DEFAULT NULL,
  `title` varchar(191) NOT NULL,
  `description` text NOT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'open',
  `priority` varchar(191) NOT NULL DEFAULT 'normal',
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  `closedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `servicedesk_requests_groupId_fkey` (`groupId`),
  KEY `servicedesk_requests_categoryId_fkey` (`categoryId`),
  KEY `servicedesk_requests_requesterId_fkey` (`requesterId`),
  KEY `servicedesk_requests_assigneeId_fkey` (`assigneeId`),
  KEY `servicedesk_requests_organizationId_fkey` (`organizationId`),
  CONSTRAINT `servicedesk_requests_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `servicedesk_requests_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `servicedesk_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `servicedesk_requests_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `servicedesk_groups` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `servicedesk_requests_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `servicedesk_requests_requesterId_fkey` FOREIGN KEY (`requesterId`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sessions
CREATE TABLE `sessions` (
  `id` varchar(191) NOT NULL,
  `sessionToken` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `expires` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessions_sessionToken_key` (`sessionToken`),
  KEY `sessions_userId_fkey` (`userId`),
  CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- slas
CREATE TABLE `slas` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `hoursLimit` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- system_settings
CREATE TABLE `system_settings` (
  `id` varchar(191) NOT NULL,
  `key` varchar(191) NOT NULL,
  `value` text NOT NULL,
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `system_settings_key_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- tasks
CREATE TABLE `tasks` (
  `id` varchar(191) NOT NULL,
  `title` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `type` varchar(191) NOT NULL DEFAULT 'task',
  `status` varchar(191) NOT NULL DEFAULT 'opened',
  `priority` varchar(191) NOT NULL DEFAULT 'normal',
  `isPrivate` tinyint(1) NOT NULL DEFAULT 0,
  `dueDate` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  `creatorId` varchar(191) NOT NULL,
  `completedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `tasks_creatorId_fkey` (`creatorId`),
  CONSTRAINT `tasks_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- task_assignees
CREATE TABLE `task_assignees` (
  `id` varchar(191) NOT NULL,
  `taskId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `task_assignees_taskId_userId_key` (`taskId`,`userId`),
  KEY `task_assignees_userId_fkey` (`userId`),
  CONSTRAINT `task_assignees_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_assignees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- task_comments
CREATE TABLE `task_comments` (
  `id` varchar(191) NOT NULL,
  `taskId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `content` text NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  KEY `task_comments_taskId_fkey` (`taskId`),
  KEY `task_comments_userId_fkey` (`userId`),
  CONSTRAINT `task_comments_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_comments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- task_favorites
CREATE TABLE `task_favorites` (
  `id` varchar(191) NOT NULL,
  `taskId` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `task_favorites_taskId_userId_key` (`taskId`,`userId`),
  KEY `task_favorites_userId_fkey` (`userId`),
  CONSTRAINT `task_favorites_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `task_favorites_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- telephony_blacklist
CREATE TABLE `telephony_blacklist` (
  `id` varchar(191) NOT NULL,
  `number` varchar(191) NOT NULL,
  `reason` varchar(191) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `telephony_blacklist_number_key` (`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- telephony_providers
CREATE TABLE `telephony_providers` (
  `id` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `host` varchar(191) NOT NULL,
  `port` int(11) NOT NULL DEFAULT 5060,
  `username` varchar(191) NOT NULL,
  `password` varchar(191) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- users
CREATE TABLE `users` (
  `id` varchar(191) NOT NULL,
  `login` varchar(191) NOT NULL,
  `email` varchar(191) NOT NULL,
  `password` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `surname` varchar(191) NOT NULL DEFAULT '',
  `fullname` varchar(191) NOT NULL DEFAULT '',
  `position` varchar(191) NOT NULL DEFAULT '',
  `department` varchar(191) NOT NULL DEFAULT '',
  `company` varchar(191) NOT NULL DEFAULT '',
  `description` text DEFAULT NULL,
  `location` varchar(191) NOT NULL DEFAULT '',
  `photoUrl` varchar(191) DEFAULT NULL,
  `language` varchar(191) NOT NULL DEFAULT 'en',
  `timezone` int(11) NOT NULL DEFAULT 0,
  `isAdmin` tinyint(1) NOT NULL DEFAULT 0,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `workState` int(11) NOT NULL DEFAULT 1,
  `lastActivity` datetime(3) DEFAULT NULL,
  `dateBirthday` datetime(3) DEFAULT NULL,
  `dateWorkSince` datetime(3) DEFAULT NULL,
  `phoneWork` varchar(191) NOT NULL DEFAULT '',
  `phoneMobile` varchar(191) NOT NULL DEFAULT '',
  `phoneHome` varchar(191) NOT NULL DEFAULT '',
  `phoneFax` varchar(191) NOT NULL DEFAULT '',
  `phoneSip` varchar(191) NOT NULL DEFAULT '',
  `messengerSkype` varchar(191) NOT NULL DEFAULT '',
  `messengerIcq` varchar(191) NOT NULL DEFAULT '',
  `createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_login_key` (`login`),
  UNIQUE KEY `users_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- work_schedules
CREATE TABLE `work_schedules` (
  `id` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `monday` tinyint(1) NOT NULL DEFAULT 1,
  `tuesday` tinyint(1) NOT NULL DEFAULT 1,
  `wednesday` tinyint(1) NOT NULL DEFAULT 1,
  `thursday` tinyint(1) NOT NULL DEFAULT 1,
  `friday` tinyint(1) NOT NULL DEFAULT 1,
  `saturday` tinyint(1) NOT NULL DEFAULT 0,
  `sunday` tinyint(1) NOT NULL DEFAULT 0,
  `startTime` varchar(191) NOT NULL DEFAULT '09:00',
  `endTime` varchar(191) NOT NULL DEFAULT '18:00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `work_schedules_userId_key` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
