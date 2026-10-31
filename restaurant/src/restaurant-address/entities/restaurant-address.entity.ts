import { Restaurant } from "../../restaurants/entities/restaurant.entity";
import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class RestaurantAddress {
    @PrimaryGeneratedColumn("uuid")
    id!: string

    @Column()
    street!: string;

    @Column()
    number!: string;

    @Column()
    city!: string;

    @Column()
    state!: string

    @Column()
    postalCode!: string;

    @Column({ type: "decimal", precision: 10, scale: 8 })
    latitude!: number;

    @Column({ type: "decimal", precision: 11, scale: 8 })
    longitude!: number;

    @OneToOne(() => Restaurant, (restaurant) => restaurant.restaurantAddress)
    @JoinColumn()
    restaurant!: Restaurant;
}
