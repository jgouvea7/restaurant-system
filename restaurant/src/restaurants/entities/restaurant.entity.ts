import { Product } from "../../products/entities/product.entity";
import { RestaurantAddress } from "../../restaurant-address/entities/restaurant-address.entity";
import { Column, CreateDateColumn, Entity, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Restaurant {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column()
    name!: string

    @Column()
    slug!: string;

    @Column({ nullable: true })
    description!: string;

    @Column()
    phone!: string;

    @Column({ type: "uuid"})
    ownerUserId!: string;

    @CreateDateColumn({ type: "timestamp", precision: 6 })
    createdAt!: Date

    @UpdateDateColumn({ type: "timestamp", precision: 6 })
    updatedAt!: Date

    @OneToOne(() => RestaurantAddress, (restaurantAddres) => restaurantAddres.restaurant)
    restaurantAddress!: RestaurantAddress;

    @OneToMany(() => Product, (product) => product.restaurant)
    products!: Product[];

}
