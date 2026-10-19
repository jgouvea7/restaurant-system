import { Costumer } from "src/costumer/entities/costumer.entity"
import { Courier } from "src/courier/entities/courier.entity"
import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from "typeorm"

@Entity()
export class User {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column()
    firstName!: string;

    @Column()
    lastName!: string;

    @Column({ default: 'ACTIVE' })
    status!: boolean;

    @OneToOne(() => Costumer, (costumer) => costumer.user)
    costumer?: Costumer;

    @OneToOne(() => Courier, (courier) => courier.user)
    courier?: Courier;
}
