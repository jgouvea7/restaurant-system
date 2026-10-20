import { Costumer } from "src/costumer/entities/costumer.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Address {
    @PrimaryGeneratedColumn("uuid")
    id!: string

    @Column()
    street!: string;

    @Column()
    number!: string;

    @Column()
    city!: string;

    @Column()
    state!: string;

    @Column()
    postalCode!: string;

    @Column({ type: "decimal", precision: 10, scale: 8})
    latitude!: number;

    @Column({ type: "decimal", precision: 11, scale: 8})
    longitude!: number;

    @ManyToOne(() => Costumer, (costumer) => costumer.address, {
        nullable: false
    })
    @JoinColumn({ name: "costumer_id" })
    costumer!: Costumer

    
}
