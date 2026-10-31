import { User } from "src/users/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Owner {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({type: "varchar", length: 14, nullable: true })
    document!: string | null

    @CreateDateColumn({ type: "timestamp", precision: 6})
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamp", precision: 6 })
    updatedAt!: Date;

    @OneToOne(() => User, (user) => user.costumer)
    @JoinColumn({ name: "user_id"})
    user!: User;
}
