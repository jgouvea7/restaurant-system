import { Costumer } from "src/costumer/entities/costumer.entity"
import { Courier } from "src/courier/entities/courier.entity"
import { Owner } from "src/owner/entities/owner.entity";
import { Column, CreateDateColumn, Entity, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

export enum userStatus {
    ACTIVE = "active",
    DESACTIVE = "desactive"
}

@Entity()
export class User {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column()
    firstName!: string;

    @Column()
    lastName!: string;

    @Column()
    email!: string;
    
    @Column()
    password!: string

    @Column({ default: userStatus.ACTIVE })
    status!: userStatus

    @CreateDateColumn({ type: "timestamp", precision: 6 })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamp", precision: 6})
    updatedAt!: Date;

    @OneToOne(() => Costumer, (costumer) => costumer.user)
    costumer?: Costumer;

    @OneToOne(() => Courier, (courier) => courier.user)
    courier?: Courier;

    @OneToOne(() => Owner, (owner) => owner.user)
    owner?: Owner;
}
