import { User } from "src/users/entities/user.entity";
import { Column, Entity, JoinColumn, PrimaryGeneratedColumn, OneToOne } from "typeorm";

enum VehicleType {
    CAR,
    MOTO,
    BYCICLE
}

@Entity()
export class Courier {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column()
    vehicleType!: VehicleType;

    @Column({ default: false })
    available!: boolean

    @OneToOne(() => User, (user) => user.courier)
    @JoinColumn({ name: "user_id" })
    user!: User
}
