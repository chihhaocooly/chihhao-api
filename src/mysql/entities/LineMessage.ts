import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("line_message", { schema: "huang" })

export class LineMessage {

  @PrimaryGeneratedColumn("uuid") // 由資料庫自動生成 UUID
  @Column("varchar", {
    primary: true,
    name: "lineMessageKey",
    length: 50,
  })
  lineMessageKey!: string; // 非空斷言運算符

  @Column("json", { name: "customPayload" })
  customPayload!: object; // 確保初始化時有值

  @Column("json", { name: "keyWords" })
  keyWords!: string[]; // 確保初始化時有值

  @Column("varchar", {
    name: "title",
    length: 50,
  })
  title!: string

  @Column("varchar", {
    name: "type",
    length: 50,
  })
  type!: string

  @Column("timestamp", {
    name: "createdAt",
    nullable: true,
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt?: Date | null; // 可選屬性

  @Column("timestamp", {
    name: "updatedAt",
    nullable: true,
    default: () => "CURRENT_TIMESTAMP",
  })
  updatedAt?: Date | null; // 可選屬性
}