import { Restaurant } from "../../restaurants/entities/restaurant.entity";
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Product {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column()
    name!: string;

    @Column({ nullable: true })
    description!: string

    @Column({ type: "numeric", precision: 10, scale: 2 })
    price!: string

    @Column({ nullable: true })
    imageUrl!: string;

    @Column()
    isAvailable!: boolean;

    @Column()
    isActive!: boolean

    @Column({ nullable: true })
    preparationTimeMinutes!: number;

    @CreateDateColumn({ type: "timestamp", precision: 6 })
    createdAt!: Date;
    
    @UpdateDateColumn({ type: "timestamp", precision: 6 })
    updatedAt!: Date;

    @ManyToOne(() => Restaurant, (restaurant) => restaurant.products)
    restaurant!: Restaurant;
}
