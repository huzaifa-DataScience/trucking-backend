import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Bid } from './bid.entity';
import { BidAttachment } from './bid-attachment.entity';
import { User } from './user.entity';

@Entity({ name: 'Bid_Comments' })
export class BidComment {
  @PrimaryGeneratedColumn({ name: 'CommentId' })
  id!: number;

  @Column({ name: 'BidId', type: 'int' })
  bidId!: number;

  @ManyToOne(() => Bid, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'BidId' })
  bid!: Bid;

  @Column({ name: 'UserId', type: 'int' })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'UserId' })
  user!: User;

  @Column({ name: 'Body', type: 'nvarchar', nullable: true })
  body!: string | null;

  @Column({ name: 'CreatedAt', type: 'datetime2' })
  createdAt!: Date;

  @Column({ name: 'UpdatedAt', type: 'datetime2', nullable: true })
  updatedAt!: Date | null;

  @Column({ name: 'DeletedAt', type: 'datetime2', nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => BidCommentAttachment, (a) => a.comment)
  commentAttachments!: BidCommentAttachment[];

  @OneToMany(() => BidCommentMention, (m) => m.comment)
  mentions!: BidCommentMention[];
}

@Entity({ name: 'Bid_Comment_Mentions' })
export class BidCommentMention {
  @Column({ name: 'CommentId', type: 'int', primary: true })
  commentId!: number;

  @ManyToOne(() => BidComment, (c) => c.mentions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'CommentId' })
  comment!: BidComment;

  @Column({ name: 'UserId', type: 'int', primary: true })
  userId!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'UserId' })
  user!: User;

  @Column({ name: 'ReadAt', type: 'datetime2', nullable: true })
  readAt!: Date | null;
}

@Entity({ name: 'Bid_Comment_Attachments' })
export class BidCommentAttachment {
  @Column({ name: 'CommentId', type: 'int', primary: true })
  commentId!: number;

  @ManyToOne(() => BidComment, (c) => c.commentAttachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'CommentId' })
  comment!: BidComment;

  @Column({ name: 'AttachmentId', type: 'int', primary: true })
  attachmentId!: number;

  @ManyToOne(() => BidAttachment)
  @JoinColumn({ name: 'AttachmentId' })
  attachment!: BidAttachment;
}
