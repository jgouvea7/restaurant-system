import { Address } from "src/address/entities/address.entity";
import { User } from "src/users/entities/user.entity";
import { Column, Entity, JoinColumn, OneToMany, OneToOne, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Costumer {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column()
    phone!: string;

    @OneToMany(() => Address, (address) => address.costumer)
    address!: Address[];

    @OneToOne(() => User, (user) => user.costumer)
    @JoinColumn({ name: "user_id" })
    user!: User;
}
