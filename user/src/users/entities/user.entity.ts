import { Costumer } from "src/costumer/entities/costumer.entity"
import { Courier } from "src/courier/entities/courier.entity"
import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from "typeorm"

export enum userStatus {
    ACTIVE,
    DESACTIVE
}

@Entity()
export class User {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column()
    firstName!: string;

    @Column()
    lastName!: string;

    @Column({ default: userStatus.ACTIVE })
    status!: userStatus

    @OneToOne(() => Costumer, (costumer) => costumer.user)
    costumer?: Costumer;

    @OneToOne(() => Courier, (courier) => courier.user)
    courier?: Courier;
}
